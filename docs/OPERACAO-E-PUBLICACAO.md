# Operação e publicação do acompanhamento

## Estado desta entrega

Implementação local. Nenhuma planilha real, deployment do Apps Script ou site Netlify foi alterado por esta implementação. Os testes usam registros fictícios e simulam envio de e-mail. É necessário validar o serviço Google em uma cópia da planilha antes da ativação em produção.

Validação posterior: o usuário configurou o Apps Script e confirmou o funcionamento dos fluxos pelo Netlify Dev, incluindo a recuperação por e-mail, antes de autorizar o commit. As alterações no Google foram feitas pelo usuário; o agente não publicou o site na Netlify. A suíte local atual contém 18 testes aprovados.

## Preparação em ambiente de teste

1. Copie a planilha original e salve também o código/versão atualmente publicados. Confirme que a cópia contém as abas e os registros esperados. Mantenha a planilha privada.
2. Na cópia, abra Extensões → Apps Script. Substitua o código pelo conteúdo de `apps-script/Code.gs`. Remova arquivos antigos que definam outros `doGet`, `doPost` ou operações antigas. Não mantenha uma segunda versão ativa desses handlers no projeto.
3. Configure as propriedades do script:

   | Propriedade | Valor |
   |---|---|
   | `BACKEND_SECRET` | Um segredo novo e aleatório, com pelo menos 32 caracteres; use o mesmo na Netlify |
   | `SITE_URL` | Origem HTTPS do ambiente de teste, sem caminho, query ou fragmento |

   Gere o segredo fora do código, por exemplo com `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`, e guarde-o em um gerenciador de segredos. Não reutilize os valores antigos do admin nem os valores fictícios dos testes.

4. Execute `setup()` manualmente pelo editor, usando a conta responsável pela planilha e pelos e-mails. Autorize acesso à planilha, gestão de gatilhos e envio de e-mail. A rotina não envia mensagens de teste ou mensagens em massa.
5. Confirme a criação dos gatilhos `processRecoveryQueue` (a cada minuto) e `onSheetEdit` (ao editar a planilha). A rotina evita duplicá-los quando executada novamente pela mesma conta. Verifique também gatilhos antigos ou pertencentes a outras contas e remova manualmente os que não devem continuar executando.
6. Publique uma versão do web app executada como a conta responsável e acessível pelas requisições da Netlify. A URL deve terminar em `/exec`; a autenticação dos handlers exige o segredo no corpo da requisição, inclusive para listagem de reviews. Se políticas do Workspace impedirem esse acesso, resolva isso antes da ativação.
7. Configure `.env` local ou variáveis do deploy de teste: `APPS_SCRIPT_URL`, `BACKEND_SECRET`, `SITE_URL`. A origem de `SITE_URL` deve coincidir com a configurada no Apps Script. Configure `GEMINI_API_KEY` separadamente se for testar o chatbot.
8. Teste com um endereço de e-mail controlado: criação, recebimento, consulta, mudança de status, recuperação e ocultação de review. Não use dados reais de clientes.

Os links de e-mail usam a origem HTTPS configurada. Para abrir um link de teste no Netlify Dev local, substitua somente a origem por `http://localhost:8888`, preservando `/track.html` e o fragmento. Nunca aponte o ambiente local à planilha real apenas para experimentar.

## Migração e preservação

`setup()` acrescenta cabeçalhos ausentes sem apagar as linhas existentes. Preserva os IDs existentes e cria números legíveis `ART-00001`, etc. O contador `ORDER_SEQUENCE` fica nas propriedades do script; não apague essa propriedade. Os status conhecidos são mapeados:

A rotina também registra `SPREADSHEET_ID` automaticamente a partir da planilha vinculada. Requisições web e o processamento da fila abrem essa planilha explicitamente por ID, pois métodos de contexto ativo não estão disponíveis em web apps. Ao copiar o projeto para outra planilha, execute setup na cópia para atualizar esse vínculo. [Documentação do Google](https://developers.google.com/apps-script/guides/bound).

| Anterior | Novo |
|---|---|
| New | Received |
| Contacted | Contacted |
| In Progress | In progress |
| Done | Completed |

Status personalizados existentes são preservados, mas precisam ser revisados na planilha, pois o seletor passa a usar os quatro estados acima. Não reordene as colunas técnicas. A rotação de tokens pressupõe `AccessHash`, `RecoveryHash` e `RecoveryExpires` adjacentes nessa ordem.

Pedidos legados não recebem e-mails em massa. Com e-mail válido, eles podem ser recuperados pela página de acompanhamento. Campos em branco de `AccessEnabled` e `Visible` são inicializados como verdadeiros. Executar a migração novamente preserva caixas desmarcadas, números e hashes existentes.

## Gestão diária no Google Sheets

### Pedidos

- `Status`: etapa atual.
- `ClientMessage`: mensagem **pública para o cliente daquele pedido**. Não colocar notas internas aqui.
- `LastUpdated`: atualizado automaticamente quando Status, Type ou ClientMessage são editados, inclusive colagens que afetem várias linhas.
- `AccessEnabled`: desmarcar bloqueia acompanhamento e recuperação. Para revogação definitiva antes de reativar, limpe também AccessHash, RecoveryHash e RecoveryExpires. Apenas desmarcar e remarcar reabilita um link cujo hash ainda exista.
- `MailState`: informa se o e-mail inicial foi enviado. Uma falha de e-mail não significa perda do pedido; use recuperação, sem recriar a encomenda.

Não editar `Id`, `Number`, hashes, RequestId ou Fingerprint. Há avisos de proteção contra mudanças acidentais; esses avisos não substituem permissões de compartilhamento. O titular da planilha continua podendo alterar células técnicas. Ao ordenar linhas, selecione a tabela inteira, nunca apenas uma coluna.

O cliente vê somente número, tipo, status, ClientMessage e data de atualização. Nome, e-mail, orçamento, descrição e referências não fazem parte da resposta de acompanhamento. Alterações/cancelamentos são tratados por contato com a artista.

### Reviews

Desmarque `Visible` para ocultar uma avaliação. A listagem e a média são calculadas diretamente das reviews visíveis; não há soma manual para corrigir. Atualize a página para consultar o estado atual.

As abas antigas `Ratings` e `Stats` ficam preservadas como histórico. A implementação antiga registrava a mesma estrela tanto em `Reviews` quanto em `Ratings`, sem uma relação inequívoca entre elas. Somar ambas duplicaria notas. A média nova usa **somente reviews visíveis**; notas avulsas antigas sem review permanecem arquivadas e não entram nessa média. O formulário atual exige uma review escrita e não oferece avaliação avulsa.

## Recuperação e limites

A solicitação registra uma linha em `_RecoveryQueue` sem consultar os pedidos. Endereços conhecidos e desconhecidos recebem a mesma resposta. O gatilho processa até cinco solicitações por execução e envia, em um único e-mail, links individuais para todos os pedidos habilitados daquele endereço.

Os tokens de recuperação são derivados criptograficamente de um ID aleatório e do segredo do backend. Apenas os hashes ficam nos pedidos. A fila guarda ID da solicitação, e-mail e estado, não tokens em texto puro. O prazo de 15 minutos começa quando o processamento prepara os links. Abrir o link não consome o acesso; é necessário confirmar. A confirmação usa um bloqueio do Apps Script para impedir dois usos e altera os três campos técnicos em uma única escrita de intervalo.

Se a resposta da confirmação se perder depois de o token ser consumido, peça outro e-mail. O acesso anterior já pode ter sido substituído; a recuperação permite obter um novo. O link criado após confirmação é exibido para salvar/copiar; o token não é guardado no armazenamento do navegador e é removido da barra de endereço após leitura.

Limites persistentes por janela de uma hora:

- Consultas: 120 por origem/IP.
- Solicitações de recuperação: 20 por origem/IP e 3 por e-mail.
- Criação/confirmacão/review: 30 por operação e origem/IP.
- Novas encomendas: 5 por e-mail.

O identificador de IP é um hash com segredo fornecido pela Function, não o IP em texto puro. A aba `_RateLimits` retém apenas janelas atuais, com limite de 5.000 entradas. As abas técnicas ficam ocultas. O rate limit é uma proteção básica para baixo volume, não substitui proteção de infraestrutura contra ataques de grande escala.

Falhas de e-mail na fila são tentadas até três vezes. Solicitações pendentes com mais de 30 minutos expiram; registros da fila são eliminados após 24 horas. As cotas de MailApp dependem da conta. Confira o histórico de execuções do gatilho e os estados `Pending`, `Processed`, `Failed` e `Expired` na aba técnica. Não habilite logs contendo tokens, segredos ou payloads de pedidos.

## Publicação coordenada

1. Conclua a validação na cópia da planilha e prepare o build Netlify. Para um novo domínio/site, configure as mesmas origens corretas nos dois serviços.
2. Faça backup da planilha real e do código atual. Planeje uma breve janela de manutenção dos formulários: as versões antiga e nova do backend não são compatíveis para submissões.
3. No projeto Apps Script real, instale o código novo, configure um segredo novo e SITE_URL, execute setup e publique uma **nova versão do deployment existente**. Isso fecha as operações antigas na URL que já era conhecida. Revogue outros deployments antigos ainda acessíveis; publicar um endpoint novo sozinho não fecha os antigos.
4. Configure na Netlify as variáveis novas e publique o código/site/Functions novos. Remova do ambiente `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` e `ADMIN_DELETE_SECRET`; remova `ADMIN_SECRET` das propriedades antigas do Apps Script. Preserve as configurações do chatbot.
5. Confirme que `/admin/` e endpoints `admin-*` não existem, e que as ações antigas no Apps Script são recusadas. Confirme que arquivos `apps-script/`, `server/`, `docs/`, `.env` e fontes das Functions não são arquivos estáticos públicos.
6. Faça uma encomenda de teste autorizada com e-mail controlado, valide ponta a ponta e confira a fila/gatilhos. Não declarar concluído com base apenas nos testes locais.

Em caso de problema, desative temporariamente os formulários/Functions e corrija mantendo as consultas antigas bloqueadas. Não restaure inadvertidamente a versão antiga que permitia consulta por nome/e-mail. Os dados preservados e o backup permitem recuperação controlada.

## Testes locais

### Diagnóstico de reviews indisponíveis

A leitura pública não usa o bloqueio de gravação. A página espera até 55 segundos (originalmente esperava apenas 8) e distingue erro de carregamento de uma lista vazia. A consulta do servidor tem limite de 50 segundos, abaixo do [limite síncrono da Netlify](https://docs.netlify.com/build/functions/configuration/). Latência além disso ainda pode causar indisponibilidade.

Se um e-mail chegar apesar de erro na tela, a fila recebeu a solicitação, mas a confirmação pode ter se perdido. Use o link recebido. Repetições da mesma solicitação pelo navegador reaproveitam o RequestId até receber confirmação; o backend não cria outra linha nem outro e-mail para esse ID enquanto ele permanecer na fila (até 24 horas). A rotina não reenvia automaticamente requisições que possam ter sido processadas. Após sucesso, uma nova solicitação explícita usa um novo ID.

O retorno da Function inclui um código seguro para diferenciar `UPSTREAM_TIMEOUT` (504), `UPSTREAM_NETWORK_ERROR`, `UPSTREAM_NON_JSON`, `UPSTREAM_AUTH_REJECTED` e `BACKEND_BUSY`. O terminal registra somente ação, código e duração, sem payloads, e-mails, URLs ou segredos.

Se ocorrer 503, execute `diagnoseSetup()` no editor do Apps Script. Ela não cria linhas nem envia e-mails: informa se as propriedades estão presentes, se a planilha pode ser aberta e se a aba Reviews contém os cabeçalhos esperados. O relatório oculta o segredo e o identificador da planilha.

Depois de atualizar `Code.gs`, publique uma nova versão do deployment existente para que as requisições `/exec` usem as correções. Apenas rodar a rotina no editor não atualiza a versão implantada. `BACKEND_BUSY` indica disputa de bloqueio; `SHEET_ACCESS_FAILED` indica falha ao abrir a planilha; `SETUP_REQUIRED` indica migração/configuração pendente. Mensagens públicas não incluem o conteúdo de exceções do Google.

`npm test` executa os testes do Apps Script simulado e das Functions. `npm run test:browser` sobe um servidor de fixtures na porta 8899 e testa com Chromium, interceptando os endpoints; nenhum e-mail real é enviado. Capturas ficam em `reports/`, fora do Git. `npm run build` gera apenas o conteúdo público em `dist/`.

As simulações não comprovam permissões, cotas, gatilhos, propagação de headers ou entrega real de e-mail no Google/Netlify. Essas verificações continuam obrigatórias no ambiente de teste.

Referências: [Apps Script Lock](https://developers.google.com/apps-script/reference/lock/lock), [proteções de planilha](https://developers.google.com/apps-script/reference/spreadsheet/protection), [cotas](https://developers.google.com/apps-script/guides/services/quotas), [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app).
