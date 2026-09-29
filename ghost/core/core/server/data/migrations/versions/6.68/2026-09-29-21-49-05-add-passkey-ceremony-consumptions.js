const { addTable } = require('../../utils');

const passkeyCeremonyConsumptions = {
  id: { type: 'string', maxlength: 24, nullable: false, primary: true },
  passkey_credential_id: {
    type: 'string',
    maxlength: 24,
    nullable: false,
    references: 'passkey_credentials.id',
    cascadeDelete: true,
  },
  ceremony_id_hash: { type: 'string', maxlength: 64, nullable: false, unique: true },
  expires_at: { type: 'dateTime', nullable: false },
  created_at: { type: 'dateTime', nullable: false },
  '@@INDEXES@@': [['expires_at']],
};

module.exports = addTable('passkey_ceremony_consumptions', passkeyCeremonyConsumptions);
