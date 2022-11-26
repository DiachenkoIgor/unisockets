import "core-js/stable";
import { v4 } from "uuid";
import 'regenerator-runtime/runtime';
import Emittery from "emittery";
import { AliasDoesNotExistError } from "../../pkg/web/signaling/errors/alias-does-not-exist";
import { SignalingClient } from "../../pkg/web/signaling/services/signaling-client";
import { Sockets } from "../../pkg/web/sockets/sockets";
import { Bind } from "../../pkg/web/sockets/bind";
import { getLogger } from "../../pkg/web/utils/logger";

self.log = function(str) {
    console.error(self.thread_id + " " + str);
}

self.onNotifyBindAdd = function (fd, alias, connectorId) {

    if(self.sockets != undefined && !self.sockets.binds.has(fd))
        self.sockets.binds.set(fd, new Bind(alias, connectorId));
};

self.onNotifyAliasAdd = function (alias, id, isDelete) {
    var sgTm= self.signalingClient == undefined ? "" : self.signalingClient.id;

    if(self.aliasesHolder == undefined || self.aliasesHolder.has(alias) && !isDelete)
        return

    if(!isDelete)
        self.aliasesHolder.set(alias, id);
    else
        self.aliasesHolder.delete(alias);
};

self.sendWRTCconfig = function (msg) {
    self.signalingClient.handleSend(msg);
};

self.asyncResolver = new Emittery();

self.createUnisocket = function () {

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
   "threadId": self.thread_id
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
   "threadId": self.thread_id
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
    postMessage({cmd: 'aliasUpdate', idP: self.thread_id, id_param: id, alias: alias, delete: isDelete});
};

const handleAlias = async (id: string, alias: string, set: boolean) => {
  if (set) {
    logger.debug("Setting alias", {id, alias, set });

    self.aliasesHolder.set(alias, id);

    updateAlias(id, alias, false);

    logger.debug("New aliases", {
      aliases: JSON.stringify(Array.from(self.aliasesHolder)),
    });
  } else {
    logger.silly("Removing alias", { id, alias });

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

const notifyBindSet =  (fd: number, bind: Bind) => {
    postMessage({cmd: 'bindUpdate', id: self.thread_id, fd: fd, alias: bind.alias, connectorId: bind.connectorId});
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

        return await signalingClient.bind(alias);
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
        return await signalingClient.connect(alias);
    };

    const handleExternalSocket = async () => {

        if(!self.signalingClient.isConnected){
            self.signalingClient.open();
            await self.asyncResolver.once("ready");
        }
        var requestId =  v4();

        postMessage({cmd: 'socketDescriptor', id: self.thread_id, requestId: requestId});
        return await self.asyncResolver.once(requestId);

    };

    const updateBinds = async () => {
        var requestId =  v4();

        postMessage({cmd: 'fetchBinds', id: self.thread_id, requestId: requestId});

        var tmp = await self.asyncResolver.once(requestId);

        tmp.aliases.forEach(function(value, key) {
              self.aliasesHolder.set(key, value);
        });

        return tmp.binds;
    };

    const handleExternalSend = async (alias: string, connectorId: string, msg: Uint8Array) => {
var t = self.aliasesHolder.has(alias);

        if (self.aliasesHolder.has(alias)) {
            var requestId =  v4();

            postMessage({cmd: 'wrtcSend', id: self.thread_id, remoteId: self.aliasesHolder.get(alias) !, localId: connectorId, msg: msg, requestId: requestId});
            await self.asyncResolver.once(requestId);

        } else {

            logger.error("Could not find alias", {
                alias
            });
        }
    };

    const handleExternalRecv = async (alias: string, connectorId: string) => {
        console.error("handle external RECV - " + self.aliasesHolder.has(alias));
        if (self.aliasesHolder.has(alias)) {
            postMessage({cmd: 'wrtcRecv', id: self.thread_id, remoteId: self.aliasesHolder.get(alias) !, localId: connectorId});

            const msg = await self.asyncResolver.once(self.aliasesHolder.get(alias));

            logger.debug("Handling external recv", {
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
        notifyBindSet,
        updateBinds
    );

    self.unisocketImports = sockets.getImports();

    self.sockets = sockets;
    self.unisockets = sockets;
    self.signalingClient = signalingClient;

    self.thread_id = Module['_pthread_self']();
    //signalingClient.open();

}

/*self.safeToCustomThreadHolder = function () {
    postMessage({
    "cmd": "safeToCustomThreadHolder",
   "threadId": Module['_pthread_self']()
    });
};*/