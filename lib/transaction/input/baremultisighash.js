'use strict';

var _ = require('lodash');
var inherits = require('inherits');
var Input = require('./input');
var Output = require('../output');
var $ = require('../../util/preconditions');

var Script = require('../../script');
var Signature = require('../../crypto/signature');
var Sighash = require('../sighash');
var PublicKey = require('../../publickey');
var BufferUtil = require('../../util/buffer');
var TransactionSignature = require('../signature');

/**
 * @constructor
 */
function BareMultiSigHashInput(input, pubkeys, threshold, signatures) {
  Input.apply(this, arguments);
  var self = this;
  pubkeys = pubkeys || input.publicKeys;
  threshold = threshold || input.threshold;
  signatures = signatures || input.signatures;
  this.publicKeys = _.sortBy(pubkeys, function(publicKey) { return publicKey.toString('hex'); });
  this.redeemScript = Script.buildMultisigOut(this.publicKeys, threshold);
  $.checkState(this.redeemScript.equals(this.output.script),
               'Provided public keys don\'t hash to the provided output');
  this.publicKeyIndex = {};
  _.each(this.publicKeys, function(publicKey, index) {
    self.publicKeyIndex[publicKey.toString()] = index;
  });
  this.threshold = threshold;
  // Empty array of signatures
  this.signatures = signatures ? this._deserializeSignatures(signatures) : new Array(this.publicKeys.length);
}
inherits(BareMultiSigHashInput, Input);

BareMultiSigHashInput.prototype.toObject = function() {
  var obj = Input.prototype.toObject.apply(this, arguments);
  obj.threshold = this.threshold;
  obj.publicKeys = _.map(this.publicKeys, function(publicKey) { return publicKey.toString(); });
  obj.signatures = this._serializeSignatures();
  return obj;
};

BareMultiSigHashInput.prototype._deserializeSignatures = function(signatures) {
  return _.map(signatures, function(signature) {
    if (!signature) {
      return undefined;
    }
    return new TransactionSignature(signature);
  });
};

BareMultiSigHashInput.prototype._serializeSignatures = function() {
  return _.map(this.signatures, function(signature) {
    if (!signature) {
      return undefined;
    }
    return signature.toObject();
  });
};

BareMultiSigHashInput.prototype.getSignatures = function(transaction, privateKey, index, sigtype) {
  $.checkState(this.output instanceof Output);
  sigtype = sigtype || Signature.SIGHASH_ALL;

  var self = this;
  var results = [];
  _.each(this.publicKeys, function(publicKey) {
    if (publicKey.toString() === privateKey.publicKey.toString()) {
      results.push(new TransactionSignature({
        publicKey: privateKey.publicKey,
        prevTxId: self.prevTxId,
        outputIndex: self.outputIndex,
        inputIndex: index,
        signature: Sighash.sign(transaction, privateKey, sigtype, index, self.redeemScript),
        sigtype: sigtype
      }));
    }
  });
  return results;
};

BareMultiSigHashInput.prototype.addSignature = function(transaction, signature) {
  $.checkState(!this.isFullySigned(), 'All needed signatures have already been added');
  $.checkArgument(!_.isUndefined(this.publicKeyIndex[signature.publicKey.toString()]),
                  'Signature has no matching public key');
  $.checkState(this.isValidSignature(transaction, signature));
  this.signatures[this.publicKeyIndex[signature.publicKey.toString()]] = signature;
  this._updateScript();
  return this;
};

BareMultiSigHashInput.prototype._updateScript = function() {
  this.setScript(Script.buildMultisigIn(
    this._createSignatures(),
    this.redeemScript
  ));
  return this;
};

BareMultiSigHashInput.prototype._createSignatures = function() {
  return _.map(
    _.filter(this.signatures, function(signature) { return !_.isUndefined(signature); }),
    function(signature) {
      return BufferUtil.concat([
        signature.signature.toDER(),
        BufferUtil.integerAsSingleByteBuffer(signature.sigtype)
      ]);
    }
  );
};

BareMultiSigHashInput.prototype.clearSignatures = function() {
  this.signatures = new Array(this.publicKeys.length);
  this._updateScript();
};

BareMultiSigHashInput.prototype.isFullySigned = function() {
  return this.countSignatures() === this.threshold;
};

BareMultiSigHashInput.prototype.countMissingSignatures = function() {
  return this.threshold - this.countSignatures();
};

BareMultiSigHashInput.prototype.countSignatures = function() {
  return _.reduce(this.signatures, function(sum, signature) {
    return sum + (!!signature);
  }, 0);
};

BareMultiSigHashInput.prototype.publicKeysWithoutSignature = function() {
  var self = this;
  return _.filter(this.publicKeys, function(publicKey) {
    return !(self.signatures[self.publicKeyIndex[publicKey.toString()]]);
  });
};

BareMultiSigHashInput.prototype.isValidSignature = function(transaction, signature) {
  // FIXME: Refactor signature so this is not necessary
  signature.signature.nhashtype = signature.sigtype;
  return Sighash.verify(
      transaction,
      signature.signature,
      signature.publicKey,
      signature.inputIndex,
      this.redeemScript
  );
};

BareMultiSigHashInput.OPCODES_SIZE = 7; // serialized size (<=3) + 0 .. N .. M OP_CHECKMULTISIG
BareMultiSigHashInput.SIGNATURE_SIZE = 74; // size (1) + DER (<=72) + sighash (1)
BareMultiSigHashInput.PUBKEY_SIZE = 34; // size (1) + DER (<=33)

BareMultiSigHashInput.prototype._estimateSize = function() {
  return BareMultiSigHashInput.OPCODES_SIZE +
    this.threshold * BareMultiSigHashInput.SIGNATURE_SIZE +
    this.publicKeys.length * BareMultiSigHashInput.PUBKEY_SIZE;
};

module.exports = BareMultiSigHashInput;
