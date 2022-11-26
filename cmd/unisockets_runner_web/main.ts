(window as any).setImmediate = window.setInterval; // Polyfill

import 'regenerator-runtime/runtime';
import Emittery from "emittery";
import { v4 } from "uuid";
import { AliasDoesNotExistError } from "../../pkg/web/signaling/errors/alias-does-not-exist";
import { Sockets } from "../../pkg/web/sockets/sockets";
import { Bind } from "../../pkg/web/sockets/bind";
import { Transporter } from "../../pkg/web/transport/transporter";
import { getLogger } from "../../pkg/web/utils/logger";
import { Candidate, ICandidateData } from "../../pkg/web/signaling/operations/candidate";
import { IOfferData, Offer } from "../../pkg/web/signaling/operations/offer";
import { Answer, IAnswerData } from "../../pkg/web/signaling/operations/answer";

self.customThreadsHolder = new Map();

self.safeToCustomThreadHolder= async function (id, worker) {
    if(worker === undefined){
        console.error("NO SUCH THREAD!!");
        return
    }
    self.customThreadsHolder.set(id, worker);
};

self.handleBindUpdate = async function (fd, alias, id, connectorId) {
    wasmModule.socketBinds.set(fd, new Bind(alias, connectorId));

    self.notifyAllThreads(id, {
           "cmd": "notifyBindAdd",
           "fd": fd,
           "alias": alias,
           "connectorId": connectorId
        });
};

self.notifyAllThreads =  function (id, message){
    for (let [key, value] of self.customThreadsHolder){
        if(key == id || value === undefined || value.worker === undefined) return;
        value.worker.postMessage(message);
    }
/*Object.keys(PThread.pthreads).forEach(key => {
        if(key == id || PThread.pthreads[key] === undefined || PThread.pthreads[key].worker === undefined) return;
       PThread.pthreads[key].worker.postMessage(message);
    });*/
};

self.getThread = function(threadId){
    threadId = Number(threadId);
    var thread = PThread.pthreads[threadId];
    if(thread === undefined || thread.worker === undefined){
        var holder = {};
        holder.worker = self.customThreadsHolder.get(threadId);
        thread = holder;
    }

    if(thread === undefined){
        console.error("NO THREAD IN 'getThread'!!");
    }

    return thread;
}


self.handleAliasUpdate = async function (id, alias, isDelete, idP) {
    if(!isDelete){
        wasmModule.socketAliases.set(alias, id);
            self.notifyAllThreads(idP, {
               "cmd": "notifyAliasAdd",
               "alias": alias,
               "id": id,
               "isDelete": isDelete
        });
    }
    else{
        wasmModule.socketAliases.delete(alias);
           self.notifyAllThreads(idP, {
               "cmd": "notifyAliasAdd",
               "alias": alias,
               "id": id,
               "isDelete": isDelete
        });
    }
};

self.handleFetchBinds = async function (id, requestId) {
    var thread = self.getThread(id);
    thread.worker.postMessage({
       "cmd": "onFetchBinds",
       "requestId": requestId,
       "info": {
           "binds": wasmModule.socketBinds,
           "aliases": wasmModule.socketAliases
       }
    });
};

self.handleSocketDescriptor = async function (id, requestId) {
    var thread = self.getThread(id);
    self.socketDescriptors++;
    thread.worker.postMessage({
       "cmd": "onSocketDescriptor",
       "fd": self.socketDescriptors,
       "requestId": requestId
    });
};

self.handleWrtcSend = async function (id, remoteId, localId, msg, requestId) {

    await self.transporter.send(remoteId, localId, msg);

    var thread = self.getThread(id);
    thread.worker.postMessage({
       "cmd": "onWrtcSendCallback",
       "requestId": requestId
    });
};

self.handleWrtcRecv = async function (id, remoteId, localId) {
    const msg = await self.transporter.recv(remoteId, localId);

  var thread = self.getThread(id);
  thread.worker.postMessage({
   "cmd": "onWrtcRecv",
   "msg": msg,
   "alias": remoteId
    });
};

self.handleOffer = async function (id, answererId, offererId, myId) {
    self.transporter.getOffer(answererId, offererId, async (candidate: string) => {
          var thread = self.getThread(id);
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Candidate({
                offererId: offererId,
                answererId: answererId,
                candidate,
              }))
          });
    }).then((offer) => {
           var thread = self.getThread(id);
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Offer({
                offererId: myId,
                answererId: answererId,
                offer,
              }))
          });
    }).catch(console.error);
};

self.getAnswer = async function (id, answererId, offererId, myId, offer) {
    self.transporter.handleOffer(offererId, answererId, offer, async (candidate: string) => {
          var thread = self.getThread(id);
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Candidate({
                offererId: offererId,
                answererId: answererId,
                candidate,
              }))
          });
    }).then((answer) => {
          var thread = self.getThread(id);
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Answer({
                offererId: offererId,
                answererId: myId,
                answer,
              }))
          });
    }).catch(console.error);
};

self.handleAnswer = async function (answererId, answer) {
self.transporter.handleAnswer(answererId, answer);
};

self.handleCandidate = async function (offererId, candidate) {
self.transporter.handleCandidate(offererId, candidate);
};



self.createTransporter = function () {

    wasmModule.socketBinds = new Map<number, Bind>();
    wasmModule.socketAliases = new Map<string, string>();

   /* const transporterConfig: ExtendedRTCConfiguration ={}; {
  iceServers: [
    {
      urls: "stun:global.stun.twilio.com:3478?transport=udp",
    },
    {
      username:
        "f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d",
      urls: "turn:global.turn.twilio.com:3478?transport=udp",
      credential: "w1uxM55V9yVoqyVFjt+mxDBV0F87AUCemaYVQGxsPLw=",
    }
  ],
};*/

    const logger = getLogger();

    // Transporter handlers
    const handleTransporterConnectionConnect = async (id: string) => {
        logger.verbose("Handling transporter connection connect", {
            id
        });
    };
    const handleTransporterConnectionDisconnect = async (id: string) => {
        logger.verbose("Handling transporter connection disconnect", {
            id
        });
    };
    const handleTransporterChannelOpen = async (id: string) => {
        logger.verbose("Handling transporter connection open", {
            id
        });
    };
    const handleTransporterChannelClose = async (id: string) => {
        logger.verbose("Handling transporter connection close", {
            id
        });
    };

    const transporter = new Transporter(
        handleTransporterConnectionConnect,
        handleTransporterConnectionDisconnect,
        handleTransporterChannelOpen,
        handleTransporterChannelClose
    );

    self.transporter = transporter;
    self.socketDescriptors = 0;

    self.parentWsId = v4();

    self.parentSocket = new WebSocket(self.wsAddress);

       var parentMessage = new Object();
       parentMessage.opcode = "parent";
       parentMessage.id  = self.parentWsId;

    self.parentSocket.onopen = function (event){

        self.parentSocket.send(JSON.stringify(parentMessage);
    } 

}