# OctaDigital Paperclip Enhancements

All-in-one community enhancements, patches, and adapter plugins for [Paperclip](https://github.com/paperclipai/paperclip).

Este repositorio centraliza todas as correcoes, adaptadores customizados e melhorias de runtime para o Paperclip, mantido pela OctaDigital.

---

## Recursos Inclusos

| Recurso | Descricao |
| :--- | :--- |
| **Google Antigravity CLI Adapter** | Adapter completo para executar agentes com Google Antigravity CLI (`agy`), suporte a MCP servers, streaming em tempo real e continuacao de sessoes. |
| **OpenCode Adapter Otimizado** | Limpeza de `reasoning` intermediario na UI (oculta scratchpads do modelo e exibe resposta limpa), alem de parsing robusto UTF-8. |
| **Persistencia de Instrucoes e Memoria** | Corrige o ciclo de vida do agente com o hook `onProviderStopped`, garantindo que arquivos modificados em `instructions/` sejam sincronizados de volta e nunca perdidos na pasta temporaria do live run. |
| **Suporte a Modelos Claude Sonnet 3.5 / 3.7 / Haiku** | Libera os seletores de modelos Claude mais recentes na interface e runtime. |
| **Desbloqueio de Conexoes de IA Customizadas** | Remove validacoes restritivas permitindo conectar qualquer provedor compativel com OpenAI ou customizado. |
| **UI Parser com Acentuacao UTF-8** | Renderizacao correta de acentos e caracteres em portugues no terminal web. |

---

## Instalacao Rapida (1 Comando)

Execute o comando abaixo diretamente dentro do container do Paperclip:

```bash
curl -fsSL https://raw.githubusercontent.com/octadigitalia/paperclip-enhancements/main/install.sh | bash
```

### Se voce estiver no host (VPS) com Docker:

```bash
docker exec -it <container_name_ou_id> bash -c "curl -fsSL https://raw.githubusercontent.com/octadigitalia/paperclip-enhancements/main/install.sh | bash"
```

---

## Configuracao no Coolify / Docker Compose

Para garantir que os patches e adaptadores estejam sempre ativos mesmo apos recriar ou atualizar o container:

### Opcao A: Post-deployment Command no Coolify

No painel do Coolify do Paperclip, va em **Settings** > **Post-deployment Command** e adicione:

```bash
curl -fsSL https://raw.githubusercontent.com/octadigitalia/paperclip-enhancements/main/install.sh | bash
```

### Opcao B: Docker Compose

Se voce utiliza Docker Compose com volume persistente em `/paperclip`:

```yaml
services:
  paperclip:
    image: ghcr.io/paperclipai/paperclip:latest
    volumes:
      - paperclip-data:/paperclip
    # O entrypoint do Paperclip executara automaticamente o apply_patches.cjs
    # uma vez instalado pelo install.sh no volume persistente.
```

---

## Estrutura do Repositorio

```
paperclip-enhancements/
├── install.sh                  # Instalador automatico de 1 linha
├── README.md                   # Documentacao completa
├── patches/
│   └── apply_patches.cjs       # Script consolidado de runtime patches
└── adapters/
    ├── antigravity-local/      # Adapter Google Antigravity CLI (TS + Dist)
    └── opencode-local/         # Adapter OpenCode com melhorias
```

---

## Como Contribuir ou Modificar

Todas as alteracoes de adapters e patches devem ser feitas diretamente neste repositorio.

1. Clone o repositorio:
   ```bash
   git clone https://github.com/octadigitalia/paperclip-enhancements.git
   ```
2. Faca suas alteracoes nos adapters ou no `patches/apply_patches.cjs`.
3. Faca o commit e push para a branch `main`.
4. Os usuarios e servidores instalarao imediatamente as novidades com o comando `install.sh`.

---

## Licenca

Distribuido sob a licenca MIT. Desenvolvido e mantido pela OctaDigital.
