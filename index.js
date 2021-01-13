/* eslint-disable consistent-return */
/* eslint-disable class-methods-use-this */

/**
 * A transport module for postmaster-general using Redis pub/sub.
 * @module index
 */

const Promise = require("bluebird");
const Redis = require("ioredis");
const { errors } = require("postmaster-general-core");
const { Transport } = require("postmaster-general-core");

/**
 * A postmaster-general transport module using Redis pub/sub.
 * @extends Transport
 */
class RedisTransport extends Transport {
  /**
   * Constructor for the RedisTransport object.
   * @param {object} [options] - Optional settings.
   * @param {string} [options.redisUrl] - The url used to connect to Redis. Defaults to localhost.
   * @param {number} [options.timingsResetInterval] - How frequently should the transport clear its timing metrics, in milliseconds.
   * @param {*} [options.pub] - Redis publish connection for testing.
   * @param {*} [options.sub] - Redis subscription connection for testing.
   * @param {*} [options.redisOverride] - Redis lib for mock testing.
   */
  constructor(options = {}) {
    super(options);

    this.handlers = {};
    this.redisUrl = options.redisUrl;
    this.pub = options.pub || null;
    this.sub = options.sub || null;

    this.Redis = options.redisOverride || Redis;
  }

  /**
   * Connects the transport from to any services it needs to function.
   * In this case, it connects to Redis.
   * @returns {Promise}
   */
  connect() {
    return super.connect().then(() => {
      this.pub = this.pub || new this.Redis(this.redisUrl);
      this.sub = this.sub || new this.Redis(this.redisUrl);
    });
  }

  /**
   * Disconnects the transport from any services it references.
   * In this case, it simply closes the Redis connections.
   * @returns {Promise}
   */
  disconnect() {
    return super.disconnect().then(() => {
      if (this.pub) {
        this.pub.quit();
        this.pub = null;
      }
      if (this.sub) {
        this.sub.quit();
        this.sub = null;
      }
    });
  }

  /**
   * Processes a routing key into a format appropriate for the transport type.
   * @param {string} routingKey - The routing key to convert.
   * @returns {string}
   */
  resolveTopic(routingKey) {
    return super.resolveTopic(routingKey).replace(/:/g, "-");
  }

  /**
   * Adds a new message handler. This is done by subscribing to the specified topic.
   * @param {string} routingKey - The routing key of the message to handle.
   * @param {function} callback - The function to call when a new message is received.
   * @param {object} [options] - Optional params for configuring the handler.
   * @returns {Promise}
   */
  addMessageListener(routingKey, callback, options) {
    return super.addMessageListener(routingKey, callback, options).then((callbackWrapper) => {
      if (!this.sub) {
        throw new Error('Unable to add listener, "connect()" should be called first.');
      }

      const topic = this.resolveTopic(routingKey);

      if (this.handlers[topic]) {
        return this.handlers[topic];
      }

      this.handlers[topic] = callbackWrapper;
      return this.sub.subscribe(topic).then(() => this.handlers[topic]);
    });
  }

  /**
   * Deletes a message handler.
   * @param {string} routingKey - The routing key of the handler to remove.
   * @returns {Promise}
   */
  removeMessageListener(routingKey) {
    return super.removeMessageListener(routingKey).then(() => {
      const topic = this.resolveTopic(routingKey);
      delete this.handlers[topic];

      if (this.sub) {
        return this.sub.unsubscribe(topic);
      }
    });
  }

  /**
   * Starts listening to messages.
   * @returns {Promise}
   */
  listen() {
    return super.listen().then(() => {
      if (!this.sub) {
        throw new Error('Unable to start listening, "connect()" should be called first.');
      }

      this.sub.on("message", async (topic, data) => {
        try {
          if (this.handlers[topic] && data) {
            const { message, correlationId, initiator } = JSON.parse(data);
            await this.handlers[topic](message, correlationId, initiator);
          }
          // eslint-disable-next-line no-empty
        } catch (err) {}
      });
    });
  }

  /**
   * Publishes a fire-and-forget message that is not expected to return a meaningful response.
   * @param {string} routingKey - The routing key to attach to the message.
   * @param {object} [message] - The message data to publish.
   * @param {object} [options] - Optional publishing options.
   * @param {object} [options.correlationId] - Optional marker used for tracing requests through the system.
   * @param {object} [options.initiator] - Optional marker used for identifying the user who generated the initial request.
   * @returns {Promise}
   */
  publish(routingKey, message, options = {}) {
    return super.publish(routingKey, message, options).then((cId) => {
      const correlationId = cId;
      const initiator = options.initiator || "UNKNOWN";
      const topic = this.resolveTopic(routingKey);

      this.pub.publish(topic, JSON.stringify({ message, correlationId, initiator }));
    });
  }

  /**
   * Publishes an RPC-style message that waits for a response.
   * This function is not supported by the Redis transport, so calling this rejects
   * with a NotImplementedError.
   * @returns {Promise}
   */
  request() {
    return Promise.reject(
      new errors.NotImplementedError("RPC-style requests are not supported by this transport.")
    );
  }
}

module.exports = RedisTransport;
