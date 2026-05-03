'use strict';

const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // unlimited listeners

const MAX_WAIT_MS = 120_000; // default watch timeout

module.exports = emitter;
module.exports.MAX_WAIT_MS = MAX_WAIT_MS;
