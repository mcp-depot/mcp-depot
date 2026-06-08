'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    await sequelize.query(`
      DO $$
      DECLARE col_type text;
      BEGIN
        SELECT data_type INTO col_type
          FROM information_schema.columns
         WHERE table_name = 'integrations' AND column_name = 'tags';

        IF col_type IS NOT NULL AND col_type NOT IN ('json', 'jsonb') THEN
          ALTER TABLE integrations ALTER COLUMN tags DROP DEFAULT;
          IF col_type = 'ARRAY' THEN
            ALTER TABLE integrations ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
          ELSE
            ALTER TABLE integrations DROP COLUMN IF EXISTS tags;
            ALTER TABLE integrations ADD COLUMN tags jsonb NOT NULL DEFAULT '[]'::jsonb;
          END IF;
          ALTER TABLE integrations ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
        END IF;
      END $$;
    `);
  },

  async down() {
  }
};