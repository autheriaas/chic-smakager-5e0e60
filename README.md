# Autheria / Claudia's Community

Site de portfólio e encomendas em HTML, CSS e JavaScript, com Netlify Functions e Google Apps Script.

## Estrutura

```text
public/                  Arquivos enviados ao navegador
  index.html             Página principal (inclui CSS e scripts próprios)
  terms.html             Termos
  admin/                 Interface administrativa existente, até sua remoção planejada
  assets/                Imagens, ícones e vídeos
  js/                    JavaScript separado, incluindo o chatbot
  robots.txt
  sitemap.xml
netlify/functions/       Código executado no servidor pela Netlify
apps-script/Code.gs       Código publicado separadamente no Google Apps Script
scripts/build.mjs        Geração do diretório público de distribuição
docs/                    Planejamento e documentação
dist/                    Build gerado; ignorado pelo Git
netlify.toml             Configuração de build, Functions e headers
.env.example             Nomes das variáveis, sem valores secretos
```

## Build

Requer Node.js 20 ou superior. O build não depende de pacotes externos.

```sh
npm run build
```

Edite os fontes em `public/`, nunca os arquivos em `dist/`. O comando recria `dist/` copiando somente `public/`. Arquivos ocultos, links simbólicos e extensões inesperadas interrompem o build. Mesmo assim, todo conteúdo em `public/` deve ser próprio para divulgação: nunca coloque credenciais ou fontes de servidor ali.

## Netlify

Use a raiz do repositório como diretório base. O `netlify.toml` configura:

- Build: `npm run build`.
- Publicação estática: `dist`.
- Functions: `netlify/functions`, fora do diretório público.

As URLs das páginas e mídias foram preservadas; o chatbot agora usa `/js/autheria-chatbot-widget.js`. Os endpoints continuam em `/.netlify/functions/`.

Para prévia das integrações locais, use Netlify Dev com as variáveis necessárias. Um servidor estático sozinho não executa as Functions. O build local não publica o site nem altera o Apps Script.

Configure as variáveis listadas em `.env.example` na Netlify. Enquanto o admin existir, `ADMIN_DELETE_SECRET` deve coincidir com a propriedade `ADMIN_SECRET` do Apps Script. Credenciais reais ficam fora deste repositório e de `public/`.

Não envie a raiz inteira por upload manual. Um upload estático apenas de `dist/` também não substitui o deploy das Functions: prefira o fluxo de build/deploy da Netlify a partir do repositório.

Referência: [configuração de build da Netlify](https://docs.netlify.com/build/configure-builds/file-based-configuration/).

## Próximas mudanças

O [plano de acompanhamento de pedidos](docs/PLANO-ACOMPANHAMENTO-PEDIDOS.md) descreve a remoção do admin e a adoção de acompanhamento privado. A reorganização de pastas não implementa esse fluxo.
