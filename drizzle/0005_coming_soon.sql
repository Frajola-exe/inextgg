ALTER TABLE products ADD COLUMN coming_soon integer NOT NULL DEFAULT 0 CHECK (coming_soon IN (0, 1));
