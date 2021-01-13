/* eslint-disable consistent-return */
/* eslint import/no-unassigned-import: 'off' */

const chai = require("chai");
const dirtyChai = require("dirty-chai");
const { errors } = require("postmaster-general-core");
const Promise = require("bluebird");
const sinon = require("sinon");
const Redis = require("ioredis-mock");
const RedisTransport = require("..");

/* This sets up the Chai assertion library. "should" and "expect"
initialize their respective assertion properties. The "use()" functions
load plugins into Chai. "dirtyChai" just allows assertion properties to
use function call syntax ("calledOnce()" vs "calledOnce"). It makes them more
acceptable to the linter. */
const { expect } = chai;
chai.should();
chai.use(dirtyChai);

describe("redis-transport:", () => {
  let sandbox;

  before(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.reset();
  });

  describe("constructor:", () => {
    it("should properly initialize settings from input", () => {
      const transport = new RedisTransport({
        redisOverride: Redis,
      });
      expect(transport.pub).to.equal(null);
      expect(transport.sub).to.equal(null);
      expect(transport.handlers).to.be.empty();
    });
  });

  describe("connect:", () => {
    it("should return a promise that resolves", () => {
      const transport = new RedisTransport({ redisOverride: Redis });
      return transport.connect().then(() => {
        expect(transport.pub).to.exist();
        expect(transport.sub).to.exist();
      });
    });
  });

  describe("disconnect:", () => {
    it("should return a promise that resolves", () => {
      const transport = new RedisTransport({ redisOverride: Redis });
      return transport.disconnect();
    });
    it("should cleanup resources", () => {
      const transport = new RedisTransport({ redisOverride: Redis });
      return transport
        .connect()
        .then(() => transport.listen())
        .then(() => {
          return transport.disconnect();
        })
        .then(() => {
          expect(transport.pub).to.equal(null);
          expect(transport.sub).to.equal(null);
        });
    });
  });

  describe("resolveTopic:", () => {
    it("should catch invalid input", () => {
      try {
        const transport = new RedisTransport({ redisOverride: Redis });
        transport.resolveTopic(3353553);
      } catch (err) {
        return;
      }
      throw new Error("Failed to catch invalid input.");
    });
    it("should return the decoded input", () => {
      const transport = new RedisTransport({ redisOverride: Redis });
      const result = transport.resolveTopic("localhost:play_game");
      result.should.equal("localhost-play_game");
    });
  });

  describe("addMessageListener:", () => {
    let transport;

    beforeEach(() => {
      transport = new RedisTransport({ redisOverride: Redis });
    });

    afterEach(() => {
      if (transport && transport.listening) {
        return transport.disconnect();
      }
    });

    it("should return a promise that resolves", () => {
      return transport.connect().then(() =>
        transport.addMessageListener("bobMessage", (msg, correlationId, initiator) => {
          // eslint-disable-line max-nested-callbacks
          return Promise.resolve({
            result: `Received ${JSON.stringify(msg)}, ${correlationId}, ${initiator}`,
          });
        })
      );
    });
    it("should not error if called twice for the same message", () => {
      return transport.connect().then(() =>
        transport
          .addMessageListener("bobMessage", (msg, correlationId, initiator) => {
            // eslint-disable-line max-nested-callbacks
            return Promise.resolve({
              result: `Received ${JSON.stringify(msg)}, ${correlationId}, ${initiator}`,
            });
          })
          .then(() =>
            transport.addMessageListener("bobMessage", (msg, correlationId, initiator) => {
              // eslint-disable-line max-nested-callbacks
              return Promise.resolve({
                result: `Received ${JSON.stringify(msg)}, ${correlationId}, ${initiator}`,
              });
            })
          )
      );
    });
    it("should catch invalid routingKey params", () => {
      return transport
        .connect()
        .then(() =>
          transport.addMessageListener(44444, (msg, correlationId, initiator) => {
            // eslint-disable-line max-nested-callbacks
            return Promise.resolve({
              result: `Received ${JSON.stringify(msg)}, ${correlationId}, ${initiator}`,
            });
          })
        )
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (!(err instanceof TypeError)) {
            throw err;
          }
        });
    });
    it("should catch invalid callback params", () => {
      return transport
        .connect()
        .then(() => transport.addMessageListener("bobMessage"))
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (!(err instanceof TypeError)) {
            throw err;
          }
        });
    });
    it("should error if connect has not yet been called", () => {
      return transport
        .addMessageListener("bobMessage", (msg, correlationId, initiator) => {
          // eslint-disable-line max-nested-callbacks
          return Promise.resolve({
            result: `Received ${JSON.stringify(msg)}, ${correlationId}, ${initiator}`,
          });
        })
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (err.message !== 'Unable to add listener, "connect()" should be called first.') {
            throw err;
          }
        });
    });
  });

  describe("removeMessageListener:", () => {
    let transport;

    beforeEach(() => {
      transport = new RedisTransport({ redisOverride: Redis });
    });

    afterEach(() => {
      if (transport && transport.listening) {
        return transport.disconnect();
      }
    });

    it("should return a promise that resolves", () => {
      return transport.removeMessageListener("bobMessage");
    });
    it("should catch invalid routingKey params", () => {
      return transport
        .removeMessageListener(35353535)
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (!(err instanceof TypeError)) {
            throw err;
          }
        });
    });
    it("should remove the listener", () => {
      return transport
        .connect()
        .then(() =>
          transport.addMessageListener("bobMessage", () => {
            // eslint-disable-line max-nested-callbacks
            return Promise.resolve();
          })
        )
        .then(() => transport.listen())
        .then(() => {
          expect(transport.handlers.bobMessage).to.exist();
        })
        .then(() => transport.removeMessageListener("bobMessage"))
        .then(() => {
          expect(transport.handlers.bobMessage).to.not.exist();
        });
    });
  });

  describe("listen:", () => {
    let transport;

    beforeEach(() => {
      transport = new RedisTransport({ redisOverride: Redis });
    });

    afterEach(() => {
      if (transport && transport.listening) {
        return transport.disconnect();
      }
    });

    it("should return a promise that resolves", () => {
      return transport.connect().then(() => transport.listen());
    });
    it("should start listening", () => {
      return transport
        .connect()
        .then(() => transport.listen())
        .then(() => {
          transport.listening.should.be.true();
        });
    });
    it("should error if connect hasn't been called", () => {
      return transport
        .listen()
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (err.message !== 'Unable to start listening, "connect()" should be called first.') {
            throw err;
          }
        });
    });
  });

  describe("publish:", () => {
    let transport;

    beforeEach(() => {
      transport = new RedisTransport({ redisOverride: Redis });
    });

    afterEach(() => {
      if (transport && transport.listening) {
        return transport.disconnect();
      }
    });

    it("should return a promise that resolves", () => {
      return transport
        .connect()
        .then(() => transport.listen())
        .then(() =>
          transport.publish("bob", { message: "hello" }, { host: "localhost", port: 3000 })
        );
    });
    it("should catch invalid routingKey params", () => {
      return transport
        .connect()
        .then(() => transport.listen())
        .then(() =>
          transport.publish(35353535, { message: "hello" }, { host: "localhost", port: 3000 })
        )
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (!(err instanceof TypeError)) {
            throw err;
          }
        });
    });
    it("should catch invalid correlationId params", () => {
      return transport
        .connect()
        .then(() => transport.listen())
        .then(() =>
          transport.publish("bob", {}, { correlationId: 44444, host: "localhost", port: 3000 })
        )
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (!(err instanceof TypeError)) {
            throw err;
          }
        });
    });
    it("should catch invalid initiator params", () => {
      return transport
        .connect()
        .then(() => transport.listen())
        .then(() =>
          transport.publish("bob", {}, { initiator: 44444, host: "localhost", port: 3000 })
        )
        .then(() => {
          throw new Error("Failed to catch invalid input.");
        })
        .catch((err) => {
          if (!(err instanceof TypeError)) {
            throw err;
          }
        });
    });
  });

  describe("request:", () => {
    let transport;

    beforeEach(() => {
      transport = new RedisTransport({ redisOverride: Redis });
    });

    afterEach(() => {
      if (transport && transport.listening) {
        return transport.disconnect();
      }
    });

    it("should reject with a NotImplementedException", (done) => {
      transport
        .request("bob", { message: "hello" }, { host: "localhost", port: 3000 })
        .then(() => {
          done(new Error("Failed to catch error"));
        })
        .catch((err) => {
          try {
            expect(err instanceof errors.NotImplementedError).to.be.true();
            done();
            // eslint-disable-next-line no-shadow
          } catch (err) {
            done(err);
          }
        });
    });
  });

  describe("pub/sub:", () => {
    let transport;
    let sub;
    let pub;

    beforeEach(() => {
      sub = new Redis();
      pub = sub.createConnectedClient();
      transport = new RedisTransport({ pub, sub, redisOverride: Redis });
    });

    afterEach(() => {
      if (transport && transport.listening) {
        return transport.disconnect();
      }
    });

    it("should call the proper callbacks for subscribing to a topic", (done) => {
      transport
        .connect()
        .then(() =>
          transport.addMessageListener("testkey:1", (message, correlationId, initiator) => {
            message.testKey.should.equal("testvalue");
            correlationId.should.equal("testcid1");
            initiator.should.equal("testinitiator");
            done();
          })
        )
        .then(() =>
          transport.addMessageListener("testkey:2", () => {
            done(new Error("Called the wrong listener!"));
          })
        )
        .then(() => transport.listen())
        .then(() =>
          transport.publish(
            "testkey:1",
            { testKey: "testvalue" },
            { correlationId: "testcid1", initiator: "testinitiator" }
          )
        )
        .catch((err) => done(err));
    });
  });
});
