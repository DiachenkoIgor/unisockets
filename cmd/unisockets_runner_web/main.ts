(window as any).setImmediate = window.setInterval; // Polyfill

import 'regenerator-runtime/runtime';
import Emittery from "emittery";
import { ExtendedRTCConfiguration } from "wrtc";
import { AliasDoesNotExistError } from "../../pkg/web/signaling/errors/alias-does-not-exist";
import { Sockets } from "../../pkg/web/sockets/sockets";
import { Transporter } from "../../pkg/web/transport/transporter";
import { getLogger } from "../../pkg/web/utils/logger";
import { Candidate, ICandidateData } from "../../pkg/web/signaling/operations/candidate";
import { IOfferData, Offer } from "../../pkg/web/signaling/operations/offer";
import { Answer, IAnswerData } from "../../pkg/web/signaling/operations/answer";

self.handleSocketDescriptor = async function (id, requestId) {
    self.socketDescriptors++;

    var thread = PThread.pthreads[id];
    thread.worker.postMessage({
       "cmd": "onSocketDescriptor",
       "fd": self.socketDescriptors,
       "requestId": requestId
    });
};

self.handleWrtcSend = async function (id, alias, msg, requestId) {
    await self.transporter.send(alias, msg);

    var thread = PThread.pthreads[id];
    thread.worker.postMessage({
       "cmd": "onWrtcSendCallback",
       "requestId": requestId
    });
};

self.handleWrtcRecv = async function (id, alias) {
    const msg = await self.transporter.recv(alias);

  var thread = PThread.pthreads[id];
  thread.worker.postMessage({
   "cmd": "onWrtcRecv",
   "msg": msg,
   "alias": alias
    });
};

self.handleOffer = async function (id, answererId, offererId, myId) {

    self.transporter.getOffer(answererId, async (candidate: string) => {
          var thread = PThread.pthreads[id];
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Candidate({
                offererId: offererId,
                answererId: answererId,
                candidate,
              }))
          });
    }).then((offer) => {
                  var thread = PThread.pthreads[id];
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Offer({
                offererId: myId,
                answererId: answererId,
                offer,
              }))
          });
    });
};

self.getAnswer = async function (id, answererId, offererId, myId, offer) {

    self.transporter.handleOffer(offererId, offer, async (candidate: string) => {
          var thread = PThread.pthreads[id];
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Candidate({
                offererId: offererId,
                answererId: answererId,
                candidate,
              }))
          });
    }).then((answer) => {
          var thread = PThread.pthreads[id];
          thread.worker.postMessage({
          "cmd": "sendWRTCconfig",
          "msg": JSON.stringify(new Answer({
                offererId: offererId,
                answererId: myId,
                answer,
              }))
          });
    });
};

self.handleAnswer = async function (answererId, answer) {
    self.transporter.handleAnswer(answererId, answer);
};

self.handleCandidate = async function (offererId, candidate) {
    self.transporter.handleCandidate(offererId, candidate);
};



self.createTransporter = function () {

    const transporterConfig: ExtendedRTCConfiguration = {
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
};

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
        transporterConfig,
        handleTransporterConnectionConnect,
        handleTransporterConnectionDisconnect,
        handleTransporterChannelOpen,
        handleTransporterChannelClose
    );

    self.transporter = transporter;
    self.socketDescriptors = 0;
}