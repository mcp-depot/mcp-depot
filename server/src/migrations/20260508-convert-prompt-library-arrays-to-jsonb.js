'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    await sequelize.query(`
      DO $$
      DECLARE
        col_type text;
      BEGIN
        SELECT data_type INTO col_type
          FROM information_schema.columns
         WHERE table_name = 'prompt_library' AND column_name = 'inputs';

        IF col_type IS NOT NULL AND col_type NOT IN ('json', 'jsonb') THEN
          IF col_type = 'ARRAY' THEN
            ALTER TABLE prompt_library
              ALTER COLUMN inputs TYPE jsonb USING to_jsonb(inputs),
              ALTER COLUMN inputs SET DEFAULT '[]'::jsonb;
          ELSE
            ALTER TABLE prompt_library
              ALTER COLUMN inputs TYPE jsonb USING inputs::jsonb,
              ALTER COLUMN inputs SET DEFAULT '[]'::jsonb;
          END IF;
        END IF;

        SELECT data_type INTO col_type
          FROM information_schema.columns
         WHERE table_name = 'prompt_library' AND column_name = 'tags';

        IF col_type IS NOT NULL AND col_type NOT IN ('json', 'jsonb') THEN
          IF col_type = 'ARRAY' THEN
            ALTER TABLE prompt_library
              ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags),
              ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
          ELSE
            ALTER TABLE prompt_library
              ALTER COLUMN tags TYPE jsonb USING tags::jsonb,
              ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
          END IF;
        END IF;
      END $$;
    `);
  },

  async down() {
  }
};