CREATE INDEX IF NOT EXISTS document_name_trgm_idx ON document USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS document_text_content_trgm_idx ON document USING gin (text_content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS document_text_content_ts_idx ON document USING gin (to_tsvector('german', coalesce(text_content, '')));
