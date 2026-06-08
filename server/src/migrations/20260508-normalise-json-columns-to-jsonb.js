'use strict';

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    if (sequelize.getDialect() !== 'postgres') return;

    await sequelize.query(`
      DO $$
      DECLARE col_type text;
      BEGIN
        -- prompt_library.inputs
        SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name='prompt_library' AND column_name='inputs';
        IF col_type IS NOT NULL AND col_type NOT IN ('json','jsonb') THEN
          ALTER TABLE prompt_library ALTER COLUMN inputs DROP DEFAULT;
          IF col_type='ARRAY' THEN
            ALTER TABLE prompt_library ALTER COLUMN inputs TYPE jsonb USING to_jsonb(inputs);
          ELSE
            ALTER TABLE prompt_library ALTER COLUMN inputs TYPE jsonb USING inputs::jsonb;
          END IF;
          ALTER TABLE prompt_library ALTER COLUMN inputs SET DEFAULT '[]'::jsonb;
        END IF;

        -- prompt_library.tags
        SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name='prompt_library' AND column_name='tags';
        IF col_type IS NOT NULL AND col_type NOT IN ('json','jsonb') THEN
          ALTER TABLE prompt_library ALTER COLUMN tags DROP DEFAULT;
          IF col_type='ARRAY' THEN
            ALTER TABLE prompt_library ALTER COLUMN tags TYPE jsonb USING to_jsonb(tags);
          ELSE
            ALTER TABLE prompt_library ALTER COLUMN tags TYPE jsonb USING tags::jsonb;
          END IF;
          ALTER TABLE prompt_library ALTER COLUMN tags SET DEFAULT '[]'::jsonb;
        END IF;

        -- tool_calls JSON columns (all TEXT storing JSON strings)
        SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name='tool_calls' AND column_name='requestHeaders';
        IF col_type IS NOT NULL AND col_type NOT IN ('json','jsonb') THEN
          ALTER TABLE tool_calls ALTER COLUMN "requestHeaders" DROP DEFAULT;
          ALTER TABLE tool_calls ALTER COLUMN "requestBody" DROP DEFAULT;
          ALTER TABLE tool_calls ALTER COLUMN "queryParams" DROP DEFAULT;
          ALTER TABLE tool_calls ALTER COLUMN "responseBody" DROP DEFAULT;
          
          ALTER TABLE tool_calls
            ALTER COLUMN "requestHeaders" TYPE jsonb USING "requestHeaders"::jsonb,
            ALTER COLUMN "requestBody" TYPE jsonb USING "requestBody"::jsonb,
            ALTER COLUMN "queryParams" TYPE jsonb USING "queryParams"::jsonb,
            ALTER COLUMN "responseBody" TYPE jsonb USING "responseBody"::jsonb;
            
          ALTER TABLE tool_calls
            ALTER COLUMN "requestHeaders" SET DEFAULT '{}'::jsonb,
            ALTER COLUMN "requestBody" SET DEFAULT '{}'::jsonb,
            ALTER COLUMN "queryParams" SET DEFAULT '{}'::jsonb,
            ALTER COLUMN "responseBody" SET DEFAULT '{}'::jsonb;
        END IF;

        -- system_settings.value
        SELECT data_type INTO col_type FROM information_schema.columns
          WHERE table_name='system_settings' AND column_name='value';
        IF col_type IS NOT NULL AND col_type NOT IN ('json','jsonb') THEN
          ALTER TABLE system_settings ALTER COLUMN value DROP DEFAULT;
          ALTER TABLE system_settings
            ALTER COLUMN value TYPE jsonb USING value::jsonb,
            ALTER COLUMN value SET DEFAULT '{}'::jsonb;
        END IF;

      END $$;
    `);
  },

  async down() {
  }
};