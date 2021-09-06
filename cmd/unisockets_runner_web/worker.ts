import "core-js/stable";
import { v4 } from "uuid";
import 'regenerator-runtime/runtime';
import Emittery from "emittery";
import { AliasDoesNotExistError } from "../../pkg/web/signaling/errors/alias-does-not-exist";
import { SignalingClient } from "../../pkg/web/signaling/services/signaling-client";
import { Sockets } from "../../pkg/web/sockets/sockets";
import { getLogger } from "../../pkg/web/utils/logger";

self.sendWRTCconfig = function (msg) {
    self.signalingClient.handleSend(msg);
};

self.asyncResolver = new Emittery();

self.createUnisocket = function () {

    const aliases = new Map<string, string>();


    const signalingServerConnectAddress = "ws://127.0.0.1:8892";
    const reconnectTimeout = 1000;
    const subnetPrefix = "127.0.0";

    const logger = getLogger();
    self.logger = logger;


const handleConnect = async () => {
  logger.verbose("Handling connect");
};
const handleDisconnect = async () => {
  logger.verbose("Handling disconnect");
};
const handleAcknowledgement = async (id: string, rejected: boolean) => {
  logger.debug("Handling acknowledgement", { id, rejected });

  if (rejected) {
    logger.error("Knock rejected", {
      id,
    });
  }

  await self.asyncResolver.emit("ready", true);
};
const getOffer = function (
  answererId: string,
  offererId: string,
  myId: string
) {
    postMessage({
   "cmd": "getOffer",
   "answererId": answererId,
   "offererId": offererId,
   "myId": myId,
   "threadId": Module['_pthread_self']()
    });
};
const handleOffer = async (
  answererId: string,
  offererId: string,
  myId: string,
  offer: string
) => {
    postMessage({
   "cmd": "getAnswer",
   "answererId": answererId,
   "offererId": offererId,
   "myId": myId,
   "offer": offer,
   "threadId": Module['_pthread_self']()
    });
};
const handleAnswer = async (
  offererId: string,
  answererId: string,
  answer: string
) => {
  logger.verbose("Handling answer", { offererId, answererId, answer });

    postMessage({
   "cmd": "handleAnswer",
   "answererId": answererId,
   "answer": answer
    });
};
const handleCandidate = async (
  offererId: string,
  answererId: string,
  candidate: string
) => {
  logger.verbose("Handling candidate", { offererId, answererId, candidate });

      postMessage({
   "cmd": "handleCandidate",
   "offererId": offererId,
   "candidate": candidate
    });
};
const handleGoodbye = async (id: string) => {
  logger.verbose("Handling goodbye", { id });
};

const handleAlias = async (id: string, alias: string, set: boolean) => {
  logger.debug("Handling alias", { id });

  if (set) {
    logger.verbose("Setting alias", { id, alias });

    aliases.set(alias, id);

    logger.debug("New aliases", {
      aliases: JSON.stringify(Array.from(aliases)),
    });
  } else {
    logger.verbose("Removing alias", { id, alias });

    aliases.delete(alias);

    logger.debug("New aliases", {
      aliases: JSON.stringify(Array.from(aliases)),
    });
  }
};

const handeIsAliasContains =  (alias: string) => {
    console.error("handeIsAliasContains");
    console.error(alias);
    console.error(aliases);
    console.error(aliases.has(alias));
    return aliases.has(alias);
};

const signalingClient = new SignalingClient(
  signalingServerConnectAddress,
  reconnectTimeout,
  subnetPrefix,
  handleConnect,
  handleDisconnect,
  handleAcknowledgement,
  getOffer,
  handleOffer,
  handleAnswer,
  handleCandidate,
  handleGoodbye,
  handleAlias,
  handeIsAliasContains
);

    const handleExternalIsConnected = () => {
        return signalingClient.isConnected;
    };

    const handleExternalClose = (alias: string) => {
        return signalingClient.shutdown(alias);
    };

    // Socket handlers
    const handleExternalBind = async (alias: string) => {
        logger.verbose("Handling external bind", {
            alias
        });

        await signalingClient.bind(alias);
    };

    const handleExternalAccept = async (alias: string) => {
        logger.verbose("Handling external accept", {
            alias
        });

        return await signalingClient.accept(alias);
    };

    const handleExternalConnect = async (alias: string) => {
        logger.verbose("Handling external connect", {
            alias
        });

        await signalingClient.connect(alias);
    };

    const handleExternalSocket = async () => {
        var requestId =  v4();

        postMessage({cmd: 'socketDescriptor', id: Module['_pthread_self'](), requestId: requestId});

        return await self.asyncResolver.once(requestId);
    };

    const handleExternalSend = async (alias: string, msg: Uint8Array) => {
        logger.verbose("Handling external send", {
            alias,
            msg
        });
        if (aliases.has(alias)) {
            var requestId =  v4();

            postMessage({cmd: 'wrtcSend', id: Module['_pthread_self'](), alias: aliases.get(alias) !, msg: msg, requestId: requestId});

            await self.asyncResolver.once(requestId);
        } else {
            logger.error("Could not find alias", {
                alias
            });
        }
    };

    const handleExternalRecv = async (alias: string) => {
        if (aliases.has(alias)) {
            postMessage({cmd: 'wrtcRecv', id: Module['_pthread_self'](), alias: aliases.get(alias) !});

            const msg = await self.asyncResolver.once(aliases.get(alias));

            logger.verbose("Handling external recv", {
                alias,
                msg
            });

            return msg;
        } else {
            throw new AliasDoesNotExistError();
        }
    };

    const sockets = new Sockets(
        handleExternalBind,
        handleExternalAccept,
        handleExternalConnect,
        handleExternalSend,
        handleExternalRecv,
        handleExternalClose,
        handleExternalSocket,
        handleExternalIsConnected
    );

    self.unisocketImports = sockets.getImports();
    self.sockets = sockets;
    self.signalingClient = signalingClient;

    signalingClient.open();

}