-- ============================================
-- GRUPO ALVIM - Sistema de Freelancers
-- Execute no Supabase SQL Editor
-- ============================================

-- Tabela de freelancers
CREATE TABLE IF NOT EXISTS freelancers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome          TEXT NOT NULL,
  cpf           TEXT NOT NULL UNIQUE,
  telefone      TEXT,
  email         TEXT,
  cep           TEXT,
  logradouro    TEXT,
  numero        TEXT,
  complemento   TEXT,
  bairro        TEXT,
  cidade        TEXT,
  uf            CHAR(2),
  foto_url      TEXT,
  status        TEXT DEFAULT 'ativo',  -- ativo | inativo | bloqueado
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Tabela de registros de presença (check-in / check-out)
CREATE TABLE IF NOT EXISTS registros (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  freelancer_id   UUID REFERENCES freelancers(id) ON DELETE CASCADE,
  unidade         TEXT NOT NULL,       -- ex: "Imperador", "King"
  tipo            TEXT NOT NULL,       -- 'entrada' | 'saida'
  foto_momento    TEXT,                -- foto tirada na hora (antifraude)
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  confianca_facial DECIMAL(5,4),       -- score do reconhecimento (0-1)
  gestor_id       UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- View prática para o painel do RH
CREATE OR REPLACE VIEW v_presenca AS
SELECT
  f.nome,
  f.cpf,
  f.telefone,
  r_entrada.unidade,
  r_entrada.created_at  AS entrada,
  r_saida.created_at    AS saida,
  EXTRACT(EPOCH FROM (r_saida.created_at - r_entrada.created_at))/3600
                        AS horas_trabalhadas
FROM freelancers f
JOIN registros r_entrada
  ON r_entrada.freelancer_id = f.id AND r_entrada.tipo = 'entrada'
LEFT JOIN registros r_saida
  ON r_saida.freelancer_id = f.id
  AND r_saida.tipo = 'saida'
  AND r_saida.unidade = r_entrada.unidade
  AND r_saida.created_at > r_entrada.created_at
  AND r_saida.created_at = (
    SELECT MIN(x.created_at)
    FROM registros x
    WHERE x.freelancer_id = f.id
      AND x.tipo = 'saida'
      AND x.unidade = r_entrada.unidade
      AND x.created_at > r_entrada.created_at
  )
ORDER BY r_entrada.created_at DESC;

-- ============================================
-- Storage: bucket para fotos
-- ============================================
-- Execute também no painel Storage do Supabase:
-- Criar bucket "fotos-freelancers" como PUBLIC

-- RLS policies básicas (ajuste conforme auth)
ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros    ENABLE ROW LEVEL SECURITY;

-- Permitir insert anônimo no cadastro (formulário público)
CREATE POLICY "insert_freelancer_publico"
  ON freelancers FOR INSERT
  WITH CHECK (true);

-- Permitir leitura autenticada
CREATE POLICY "select_freelancer_auth"
  ON freelancers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "insert_registro_auth"
  ON registros FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "select_registro_auth"
  ON registros FOR SELECT
  USING (auth.role() = 'authenticated');
