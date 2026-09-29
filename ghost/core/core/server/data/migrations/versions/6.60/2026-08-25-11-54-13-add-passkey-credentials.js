const { addTable } = require('../../utils');

module.exports = addTable('passkey_credentials', {
  id: { type: 'string', maxlength: 24, nullable: false, primary: true },
  user_id: {
    type: 'string',
    maxlength: 24,
    nullable: true,
    references: 'users.id',
    cascadeDelete: true,
  },
  member_id: {
    type: 'string',
    maxlength: 24,
    nullable: true,
    references: 'members.id',
    cascadeDelete: true,
  },
  credential_id: { type: 'text', maxlength: 65535, nullable: false },
  credential_id_hash: { type: 'string', maxlength: 64, nullable: false, unique: true },
  rp_id: { type: 'string', maxlength: 191, nullable: false },
  public_key: { type: 'text', maxlength: 65535, nullable: false },
  counter: { type: 'integer', unsigned: true, nullable: false, defaultTo: 0 },
  transports: { type: 'string', maxlength: 255, nullable: true },
  device_type: { type: 'string', maxlength: 50, nullable: true },
  backed_up: { type: 'boolean', nullable: false, defaultTo: false },
  name: { type: 'string', maxlength: 191, nullable: false, defaultTo: 'Passkey' },
  last_used_at: { type: 'dateTime', nullable: true },
  created_at: { type: 'dateTime', nullable: false },
  updated_at: { type: 'dateTime', nullable: true },
  '@@INDEXES@@': [
    ['user_id', 'rp_id'],
    ['member_id', 'rp_id'],
  ],
});
