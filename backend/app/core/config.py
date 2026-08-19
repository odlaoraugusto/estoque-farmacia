from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configurações da instalação, lidas de variáveis de ambiente/.env.

    Cada hospital da rede FESFSUS roda uma instalação própria (um
    servidor local por hospital, sem multi-tenant — ver docs/00_PROJETO.md
    seção 2), então nome do hospital e organização são configuração fixa
    da instalação, não uma tabela no banco.
    """

    DATABASE_URL: str

    # Autenticação / sessão (JWT assinado pelo servidor — ver README, seção
    # "Decisões técnicas" sobre unidade ativa embutida no token).
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8h, cobre um turno de plantão

    # Identificação institucional (barra superior do frontend + cabeçalho
    # dos relatórios).
    HOSPITAL_NOME: str = "Hospital Materno Infantil Dr. Joaquim Sampaio"
    HOSPITAL_ORGANIZACAO: str = "Fundação Estatal Saúde da Família"

    # Janela padrão do relatório de vencimentos próximos.
    RELATORIO_VENCIMENTO_DIAS: int = 30

    # Trilha de Auditoria (2026-08-19, diagnóstico de carga): sem período
    # informado, aplica essa janela por padrão em vez de devolver a tabela
    # movimentacoes inteira — no volume de teste (1192 linhas) isso era
    # 1,7MB e ~250ms, 5-10x mais lento que qualquer outro relatório, e só
    # cresce com o tempo real de uso. O Coordenador ainda pode digitar uma
    # data mais antiga pra ver mais.
    RELATORIO_AUDITORIA_DIAS_PADRAO: int = 90
    RELATORIO_AUDITORIA_LIMITE_PADRAO: int = 200

    # Rede interna do hospital, sem internet — múltiplas estações acessando
    # o mesmo backend por IP local. Lista separada por vírgula, ou "*"
    # para liberar geral (padrão, dado o ambiente fechado/sem internet).
    CORS_ORIGINS: str = "*"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
