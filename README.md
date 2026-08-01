# OFX para Excel

Aplicação web local para converter extratos OFX em planilhas XLSX. O FastAPI processa, valida e exporta os dados; a interface React apenas envia o arquivo e apresenta a resposta da API.

## Executar

Com Node.js 20+ e Python 3.11+ instalados, use somente:

```bash
npm run dev
```

No primeiro uso, o comando instala automaticamente as dependências do frontend e cria o ambiente isolado do backend. Depois, abra `http://127.0.0.1:5173`.

Os arquivos OFX não são gravados em disco. As conversões e os XLSX gerados ficam somente na memória e expiram após 60 minutos.
