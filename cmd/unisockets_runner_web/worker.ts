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

self.createUnisocket = function (module) {

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

const updateAlias =  (id: string, alias: string, isDelete: boolean) => {
    postMessage({cmd: 'aliasUpdate', id: Module['_pthread_self'](), id_param: id, alias: alias, delete: isDelete});
};

const handleAlias = async (id: string, alias: string, set: boolean) => {
  logger.debug("Handling alias", { id });

  if (set) {
    logger.verbose("Setting alias", { id, alias });

    self.aliasesHolder.set(alias, id);

    updateAlias(id, alias, false);

    logger.debug("New aliases", {
      aliases: JSON.stringify(Array.from(self.aliasesHolder)),
    });
  } else {
    logger.verbose("Removing alias", { id, alias });

    self.aliasesHolder.delete(alias);

    updateAlias(id, alias, true);

    logger.debug("New aliases", {
      aliases: JSON.stringify(Array.from(self.aliasesHolder)),
    });
  }
};

const handeIsAliasContains =  (alias: string) => {
    return self.aliasesHolder.has(alias);
};

const notifyBindSet =  (fd: number, alias: string) => {
    postMessage({cmd: 'bindUpdate', id: Module['_pthread_self'](), fd: fd, alias: alias});
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

        if(!self.signalingClient.isConnected){
            self.signalingClient.open();
            await self.asyncResolver.once("ready");
        }

        var requestId =  v4();

        postMessage({cmd: 'socketDescriptor', id: Module['_pthread_self'](), requestId: requestId});

        return await self.asyncResolver.once(requestId);
    };

    const handleExternalSend = async (alias: string, msg: Uint8Array) => {
        logger.verbose("Handling external send", {
            alias,
            msg
        });
        if (self.aliasesHolder.has(alias)) {
            var requestId =  v4();

            postMessage({cmd: 'wrtcSend', id: Module['_pthread_self'](), alias: self.aliasesHolder.get(alias) !, msg: msg, requestId: requestId});

            await self.asyncResolver.once(requestId);
        } else {
            logger.error("Could not find alias", {
                alias
            });
        }
    };

    const handleExternalRecv = async (alias: string) => {
        if (self.aliasesHolder.has(alias)) {
            postMessage({cmd: 'wrtcRecv', id: Module['_pthread_self'](), alias: self.aliasesHolder.get(alias) !});

            const msg = await self.asyncResolver.once(self.aliasesHolder.get(alias));

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
        handleExternalIsConnected,
        notifyBindSet
    );

    self.unisocketImports = sockets.getImports();
    self.sockets = sockets;
    self.signalingClient = signalingClient;

    //signalingClient.open();

}