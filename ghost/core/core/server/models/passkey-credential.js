const ghostBookshelf = require('./base');

const PasskeyCredential = ghostBookshelf.Model.extend({
  tableName: 'passkey_credentials',

  user() {
    return this.belongsTo('User', 'user_id', 'id');
  },

  member() {
    return this.belongsTo('Member', 'member_id', 'id');
  },
});

const PasskeyCredentials = ghostBookshelf.Collection.extend({
  model: PasskeyCredential,
});

module.exports = {
  PasskeyCredential: ghostBookshelf.model('PasskeyCredential', PasskeyCredential),
  PasskeyCredentials: ghostBookshelf.collection('PasskeyCredentials', PasskeyCredentials),
};
