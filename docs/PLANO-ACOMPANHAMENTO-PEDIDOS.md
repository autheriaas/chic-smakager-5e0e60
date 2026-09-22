# Plano: gestão pelo Google Sheets e acompanhamento privado de pedidos

Data: 22/09/2026.

Atualização de implementação: os caminhos da análise abaixo são históricos. Os arquivos públicos estão em `public/`, o Apps Script em `apps-script/Code.gs`, os auxiliares privados em `server/` e este plano em `docs/`. `npm run build` gera `dist/`. O admin e a edição pública foram removidos, e o fluxo novo de pedidos foi implementado localmente. Node foi atualizado para 24.21.0 e a CLI Netlify para 27.8.0.

Status: implementação concluída, com 13 testes de backend e cinco testes no Chromium aprovados. Após configurar o Apps Script e testar pelo Netlify Dev, o usuário confirmou que tudo funcionou e autorizou o commit. A publicação do site na Netlify não foi realizada pelo agente. Consulte `OPERACAO-E-PUBLICACAO.md` para ativação e limitações. A lista abaixo foi o roteiro original; as caixas de implementação referem-se ao código local, não a uma auditoria do deployment em produção.

## Contexto e objetivo

O projeto é o site de portfólio e encomendas de arte de Claudia, apresentado como Claudia's Community / Autheria. A artista quer administrar pedidos e avaliações diretamente no Google Sheets, dispensando o painel administrativo do site.

O visitante continuará enviando encomendas e poderá acompanhar exclusivamente seu pedido por um link privado. Não terá conta, senha de login, edição, cancelamento ou mudança de status pelo site. Dúvidas e alterações serão tratadas diretamente com a artista.

O usuário aprovou o fluxo de acompanhamento e recuperação abaixo. Preservar o visual, o conteúdo, as galerias, o chatbot e as outras funcionalidades não relacionadas. Não migrar para outro banco de dados ou framework sem necessidade discutida.

## Estrutura encontrada na análise inicial

- `index.html`: página principal, CSS e JavaScript majoritariamente embutidos, formulário de encomendas, avaliações e fluxo atual de consulta/edição.
- `terms.html`: termos e condições.
- `admin/login.html` e `admin/index.html`: login e painel de pedidos/avaliações.
- `netlify/functions/admin-*.js`: login, sessão, logout, listagem de pedidos, alteração de status e exclusão de avaliações.
- `netlify/functions/reviews.js`: leitura pública de estatísticas e avaliações via Apps Script.
- `netlify/functions/chat.js` e `autheria-chatbot-widget.js`: chatbot; preservar.
- `Code.gs`: código do Google Apps Script, com acesso à planilha e rotas de pedidos/avaliações.
- `netlify.toml`: publica atualmente a raiz (`publish = "."`) e configura Functions e cache.
- `assets/`, `robots.txt`, `sitemap.xml`: mídia e arquivos públicos.

Não foi encontrado `package.json` na inspeção inicial. Revalidar a estrutura e quaisquer instruções `AGENTS.md` ao iniciar a implementação.

### Evidências e limitações da análise

- As Functions administrativas verificam sessão antes de listar pedidos, alterar status e excluir avaliações.
- Testes locais sem acesso à rede retornaram `401` para essas três operações sem sessão e para login sem credenciais válidas; uma sessão inválida foi rejeitada.
- Há credenciais e segredos de fallback no código. Não copiar seus valores para documentação, logs ou commits novos.
- O Apps Script atual permite localizar o pedido mais recente por nome/e-mail (`findOrder`), consultar por ID/e-mail (`getOrder`) e editar por ID/e-mail (`updateOrder`). Isso não comprova posse do e-mail.
- O formulário atual tem fallback `no-cors` que pode apresentar sucesso sem confirmar a gravação e pode repetir a submissão.
- O comportamento do deploy em produção, as configurações de ambiente, as permissões da planilha e a versão publicada do Apps Script não foram verificados. Não assumir que correspondem aos arquivos locais.
- Não foi confirmado que fontes de servidor estejam acessíveis publicamente. A publicação da raiz é um ponto a revisar, não evidência de vazamento já ocorrido.

## Decisões de produto combinadas

### Envio e acompanhamento

1. Cliente envia o formulário de encomenda.
2. Servidor grava o pedido e gera um identificador legível e um token secreto separado.
3. Cliente recebe por e-mail um botão para acompanhar o pedido.
4. A página mostra número, tipo da encomenda, status, mensagem pública da artista, última atualização e contato.
5. A artista altera status e mensagem diretamente na planilha.
6. A consulta seguinte do cliente reflete essas mudanças.

O link de acompanhamento funciona enquanto não for revogado ou substituído. Não expira após 15 minutos. Quem possui o link consegue consultar o pedido: ele é uma credencial de acesso, mesmo sem login.

Não expor e-mail, dados pessoais desnecessários, referências privadas, notas internas nem a linha inteira da planilha na resposta pública. Validar o token no servidor e retornar apenas campos explicitamente permitidos.

### Recuperação do acompanhamento

1. Cliente clica em “Recuperar acompanhamento” e informa o e-mail.
2. A interface responde sempre: “Se houver pedidos associados a esse e-mail, enviaremos as instruções de acesso.”
3. Quando houver pedido, enviar recuperação somente ao endereço registrado.
4. O link de recuperação é temporário, com validade proposta de 15 minutos, e de uso único.
5. Abrir o link apresenta uma confirmação. Somente confirmar consome o token e substitui o acesso.
6. A confirmação gera um novo link de acompanhamento e invalida o anterior daquele pedido.
7. Expiração do link de recuperação não apaga nem expira o pedido; o cliente pode solicitar outro.

Não confundir o token temporário de recuperação com o token duradouro de acompanhamento. Não invalidar o acompanhamento apenas porque alguém pediu recuperação. Evitar consumir tokens com um GET, pois serviços de e-mail podem abrir links automaticamente.

Para vários pedidos associados ao mesmo e-mail, permitir recuperação por pedido sem revelar a lista na resposta pública. Sugestão: e-mail com instruções/links individuais limitados aos pedidos elegíveis. Definir os detalhes durante a implementação, preservando esse requisito.

### Gestão de avaliações

Preservar envio e exibição de avaliações. Adicionar controle de visibilidade na planilha e calcular quantidade/média a partir das avaliações visíveis. A artista poderá ocultar avaliações sem precisar ajustar contadores manualmente.

Revisar antes a relação entre abas `Stats`, `Ratings` e `Reviews`: o código também possui a ação `rating`. Evitar dupla contagem ou perda de avaliações legadas. Se houver notas independentes de reviews em uso, explicitar sua semântica antes de mudar o cálculo.

## Plano de implementação

### 1. Inspeção e backup

- [x] Reler código atual e instruções locais; conferir alterações desde a criação deste plano.
- [ ] Identificar a versão ativa do Apps Script, configurações Netlify e esquema real da planilha quando houver acesso.
- [ ] Fazer backup antes de mudar planilha ou serviço publicado.
- [x] Não sobrescrever pedidos, avaliações ou alterações do usuário.

### 2. Remover administração e edição antiga

- [x] Remover `admin/` e Functions administrativas sem deixar imports quebrados.
- [x] Remover referências e regras específicas do admin onde não forem mais necessárias.
- [x] Remover botão “Already sent a request? Edit it”, modais, handlers e requisições de edição no `index.html`.
- [x] Remover `getOrder`, `findOrder` e `updateOrder` antigos do Apps Script.
- [x] Remover operações administrativas antigas (`adminOrders`, `adminUpdateStatus`, `deleteReview`) substituídas pela gestão direta.
- [x] Fazer o roteamento rejeitar explicitamente ações desconhecidas/removidas. Hoje o POST tem inserção como comportamento padrão: não deixar uma chamada antiga cair por engano na criação de pedido.
- [x] Remover fallbacks e documentar a remoção/rotação das configurações antigas no ambiente.

### 3. Evoluir a planilha sem destruir dados

- [x] Preservar IDs internos existentes; número legível e token de acesso são campos distintos.
- [x] Adicionar status com lista de valores, mensagem para o cliente, data de atualização e campos técnicos necessários.
- [x] Estados iniciais propostos: Recebido, Contatado, Em produção, Concluído. Mapear os valores existentes (`New`, `Contacted`, `In Progress`, `Done`) sem perder significado.
- [x] Proteger colunas técnicas contra edição acidental; isso não substitui permissões de acesso à planilha.
- [x] Atualizar automaticamente a data quando a artista editar campos públicos relevantes, inclusive em colagens de múltiplas linhas.
- [x] Planejar migração repetível, sem duplicar colunas ou registros.
- [x] Permitir recuperação para pedidos legados com e-mail válido, sem disparar e-mails em massa.

### 4. Implementar servidor e inserção confiável

- [x] Usar Functions como entrada do navegador para o fluxo de pedidos; autenticar a comunicação com Apps Script por segredo próprio no ambiente/propriedades.
- [x] Não reutilizar os segredos antigos do admin. Falta de configuração deve bloquear operações protegidas.
- [x] Gerar tokens criptograficamente seguros no servidor (Nano ID seguro ou equivalente); não usar `Math.random`, número sequencial ou dados do cliente como segredo.
- [x] Guardar somente hashes dos tokens na planilha; evitar tokens em logs.
- [x] Validar tipos, tamanhos e campos aceitos; impedir que entradas virem fórmulas executáveis no Sheets.
- [x] Confirmar gravação antes de comunicar sucesso; remover o fallback opaco de sucesso presumido.
- [x] Introduzir idempotência para evitar pedidos duplicados em reenvios/retries, com proteção contra concorrência no Apps Script.
- [x] Enviar e-mail de acompanhamento e distinguir falha de envio de falha na criação do pedido.
- [x] Se o pedido já foi salvo, nunca orientar a reenviá-lo apenas porque o e-mail falhou.

### 5. Página de acompanhamento

- [x] Criar página responsiva com o estilo atual do site e textos compatíveis com seu idioma (atualmente inglês).
- [x] Mostrar apenas os campos públicos combinados, sem controles de edição.
- [x] Rejeitar tokens inválidos, antigos ou revogados sem expor dados.
- [x] Impedir cache de respostas privadas e indexação da página; evitar vazamento do token em referrers, analytics e recursos de terceiros.
- [x] Escolher transporte do token com esse cuidado; considerar fragmento no link e envio ao servidor no corpo da requisição.
- [x] Não carregar integrações desnecessárias na página privada.

### 6. Recuperação

- [x] Implementar solicitação por e-mail com resposta genérica, inclusive código HTTP e tratamento que não revelem cadastro.
- [x] Limitar solicitações por origem/e-mail e tentativas de validação; não depender de um contador em memória de uma única Function.
- [x] Criar token temporário separado e armazenar seu hash/validade/estado de consumo.
- [x] Consumir e rotacionar acesso atomicamente, impedindo dois usos concorrentes.
- [x] Invalidar o acompanhamento anterior somente após confirmação válida.
- [x] Disponibilizar o novo link ao cliente e tratar falhas de entrega/rede sem perda definitiva de acesso.
- [x] Tratar múltiplos pedidos por e-mail, cotas e falhas de envio.

### 7. Avaliações

- [x] Adicionar coluna de visibilidade e preservar o comportamento inicial das avaliações existentes.
- [x] Filtrar avaliações e recalcular estatísticas conforme a regra definida.
- [x] Garantir que mudanças manuais sejam refletidas apesar do cache (invalidação ou prazo curto documentado).
- [x] Validar envio e visualização sem nenhuma dependência do admin removido.

### 8. Organização e publicação

- [x] Separar diretório público dos fontes de servidor e `Code.gs`; ajustar `publish` no `netlify.toml`.
- [x] Atualizar caminhos de assets, Functions, chatbot e páginas após a reorganização.
- [x] Documentar variáveis Netlify, propriedades Apps Script, autorização de envio de e-mail e gatilhos necessários, sem registrar valores secretos.
- [x] Preparar a ordem de publicação de Apps Script e Netlify para não deixar consultas antigas abertas nem interromper submissões inadvertidamente.
- [ ] Confirmar em produção que arquivos de servidor não são servidos como estáticos e que rotas antigas deixaram de operar.

## Critérios de aceite

- [x] Nova encomenda produz uma única linha mesmo com repetição da mesma requisição.
- [x] Cliente recebe acesso e acompanha exclusivamente o pedido autorizado.
- [x] Token inválido/alterado não retorna informações do pedido.
- [x] Interface e API não permitem editar/cancelar/mudar status como visitante.
- [x] Nome/e-mail isolados não permitem obter pedidos ou seus tokens.
- [x] Status/mensagem editados na planilha aparecem com data coerente no acompanhamento.
- [x] Recuperação válida substitui apenas o acesso do pedido correspondente.
- [x] Token de recuperação expirado, consumido ou reutilizado em concorrência é rejeitado.
- [x] Abrir link por GET não consome recuperação nem revoga acompanhamento.
- [x] Pedidos antigos e múltiplos pedidos por e-mail são tratados corretamente.
- [x] Falha de e-mail não gera duplicidade nem falso erro de gravação.
- [x] Avaliação oculta deixa de aparecer e estatísticas seguem a regra definida.
- [ ] Admin, operações antigas e fontes de servidor não ficam acessíveis indevidamente no deploy.
- [x] Home, galerias, chatbot, termos, avaliações e layout mobile continuam funcionando.

Usar dados fictícios e mocks nos testes locais. Não enviar e-mails reais, criar pedidos de clientes ou modificar dados de produção apenas para testar. Validação final de e-mail/planilha requer ambiente e destinatário de teste definidos.

## Entregáveis e retomada

Entregar código, migração da planilha, instruções de configuração/publicação e evidências dos testes. Mudanças locais em `Code.gs` não atualizam o Apps Script publicado: esta etapa precisa ser executada e verificada separadamente.

Ao retomar: ler este documento, comparar com os arquivos atuais, verificar acesso aos serviços e começar pela inspeção e backup. A disponibilidade de acesso à Netlify, ao projeto Apps Script e à planilha ainda não foi confirmada. Não declarar implantação concluída apenas com validação local.

## Referências consultadas no planejamento

- OWASP, tokens e recuperação por e-mail: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Google Apps Script, cotas de serviços e e-mail: https://developers.google.com/apps-script/guides/services/quotas
- Google Apps Script, MailApp: https://developers.google.com/apps-script/reference/mail/mail-app

Rever cotas e APIs vigentes quando implementar. A expiração de 15 minutos é uma decisão proposta para este projeto, não um limite imposto pelo Google.
