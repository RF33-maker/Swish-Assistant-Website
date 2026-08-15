-- Add height and date_of_birth columns to the players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS height VARCHAR(20);
ALTER TABLE players ADD COLUMN IF NOT EXISTS date_of_birth DATE;
