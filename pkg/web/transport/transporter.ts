import { ChannelDoesNotExistError } from "../signaling/errors/channel-does-not-exist";
import { ConnectionDoesNotExistError } from "../signaling/errors/connection-does-not-exist";
import { SDPInvalidError } from "../signaling/errors/sdp-invalid";
import { getLogger } from "../utils/logger";
import Emittery from "emittery";
import adapter from 'webrtc-adapter';

export class Transporter {
  private logger = getLogger();
  private connections = new Map<string, RTCPeerConnection>();
  private channels = new Map<string, Map <string, RTCDataChannel>>();
  private queuedMessages = new Map<string, Map <string,Uint8Array[]>>();
  private queuedCandidates = new Map<string, string[]>();
  private asyncResolver = new Emittery();
  private configuration = {iceServers: [{urls: ["turns:turnserver.example.org", "turn:turnserver.example.org"]}]};

  constructor(
    private onConnectionConnect: (id: string) => Promise<void>,
    private onConnectionDisconnect: (id: string) => Promise<void>,
    private onChannelOpen: (id: string) => Promise<void>,
    private onChannelClose: (id: string) => Promise<void>
  ) {

    console.error(adapter.browserDetails.browser);
  }

  async close() {
    this.logger.debug("Closing transporter");

    for (let connection of this.connections) {
      await this.shutdown(connection[0]);
    }
  }

  private addDataChannel(remoteId: string,
                         localId: string,
                         channel: RTCDataChannel) {
      if(!this.channels.has(remoteId))
        this.channels.set(remoteId, new Map <string, RTCDataChannel>());

      this.channels.get(remoteId).set(localId, channel);
  }
  private addQueueMessages(remoteId: string,
                         localId: string,
                         msgs: Uint8Array[]) {

      if(!this.queuedMessages.has(remoteId))
        this.queuedMessages.set(remoteId, new Map <string, Uint8Array[]>());

      this.queuedMessages.get(remoteId).set(localId, msgs);
  }
  private dataChannelConfiguration(remoteId: string,
                                   localId: string,
                                   channel: RTCDataChannel){
    this.addDataChannel(remoteId, localId, channel);

    channel.onopen = async () => {
      await this.asyncResolver.emit(this.getChannelKey(remoteId, localId), true);

      await this.onChannelOpen(remoteId);
    };

    channel.onmessage = async (msg) => {
      msg.data.arrayBuffer().then(buffer => {this.queueAndEmitMessage(remoteId, localId, buffer);});
    };

    channel.onclose = async () => {
      this.logger.debug("Channel close", { remoteId: remoteId, localId: localId });

      await this.onChannelClose(remoteId);
    };

    if(this.queuedMessages.has(remoteId)
          && this.queuedMessages.get(remoteId).has(localId)
          && this.queuedMessages.get(remoteId).get(localId).length !=0){
      var values = this.queuedMessages.get(remoteId).get(localId);
      this.addQueueMessages(remoteId, localId, values);
    }else {
      this.addQueueMessages(remoteId, localId, []);
    }
  }

  async getOffer(
    remoteId: string,
    localId: string,
    handleCandidate: (candidate: string) => Promise<void>
  ) {
    this.logger.debug("Create offer", { remoteId, localId});

    if(this.connections.has(remoteId)
        && this.connections.get(remoteId).connectionState != "closed"){

      if(this.channels.get(remoteId) == undefined 
        || this.channels.get(remoteId).get(localId) == undefined){
            const channel = this.connections.get(remoteId).createDataChannel(localId);
            this.logger.debug("Creation Data Channel", { remoteId, localId});
            this.dataChannelConfiguration(remoteId, localId, channel);
      }
      throw "Connection already exist for localId - " + localId + "; remoteId - " + remoteId;
    }
      

    const connection = new RTCPeerConnection();
    this.connections.set(remoteId, connection);

    connection.onconnectionstatechange = async () =>
      await this.handleConnectionStatusChange(
        connection.connectionState,
        remoteId
      );

    connection.onicecandidate = async (e) => {
      e.candidate && handleCandidate(JSON.stringify(e.candidate));
    };

    const channel = connection.createDataChannel(localId);

    this.dataChannelConfiguration(remoteId, localId, channel);

    connection.ondatachannel = async ({ channel }) => {
      this.dataChannelConfiguration(channel.label, localId, channel);
    };

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    if (offer.sdp === undefined) {
      connection.close();

      throw new SDPInvalidError();
    }

    return offer.sdp
  }

  async handleOffer(
    remoteId: string,
    localId: string,
    offer: string,
    handleCandidate: (candidate: string) => Promise<void>
  ) {
    this.logger.debug("Transporter - Handle offer", { remoteId, localId, offer });
    if(this.connections.has(remoteId)
        && this.connections.get(remoteId).connectionState != "closed"){

      if(this.channels.get(remoteId) == undefined 
        || this.channels.get(remoteId).get(localId) == undefined){
            const channel = this.connections.get(remoteId).createDataChannel(localId);

            this.dataChannelConfiguration(remoteId, localId, channel);
      }
      throw "Connection already exist for localId - " + localId + "; remoteId - " + remoteId;
    }

    
    const connection = new RTCPeerConnection();

    this.connections.set(remoteId, connection);

    connection.onconnectionstatechange = async () =>
      await this.handleConnectionStatusChange(connection.connectionState, remoteId);

    connection.onicecandidate = async (e) => {
      e.candidate && handleCandidate(JSON.stringify(e.candidate));
    };

    await connection.setRemoteDescription(
      new RTCSessionDescription({
        type: "offer",
        sdp: offer,
      })
    );

    const answer = await connection.createAnswer();

    await connection.setLocalDescription(answer);

    await this.addQueuedCandidates(remoteId);

    connection.ondatachannel = async ({ channel }) => {
      this.dataChannelConfiguration(channel.label, localId, channel);
    };

    this.logger.debug("Created connection", {
      newConnections: JSON.stringify(Array.from(this.connections.keys())),
    });

    if (answer.sdp === undefined) {
      throw new SDPInvalidError();
    }
    return answer.sdp;
  }

  async handleAnswer(id: string, answer: string) {
    this.logger.debug("Transporter -  Handling answer", { id, answer });

    if (this.connections.has(id)) {
      const connection = this.connections.get(id);

      await connection?.setRemoteDescription(
        new RTCSessionDescription({
          type: "answer",
          sdp: answer,
        })
      );

      await this.addQueuedCandidates(id);
    } else {
      throw new ConnectionDoesNotExistError();
    }
  }

  async handleCandidate(id: string, candidate: string) {
    this.logger.debug("Transporter - Handling candidate", { id, candidate });
    if (
      this.connections.has(id) &&
      this.connections.get(id)!.remoteDescription // We check with `.has` and never push undefined
    ) {
      const connection = this.connections.get(id);

      await connection?.addIceCandidate(
        new RTCIceCandidate(JSON.parse(candidate))
      );

      this.logger.debug("Added candidate", { id, candidate });
    } else {
      this.logger.debug("Queueing candidate", { id, candidate });

      if (!this.queuedCandidates.has(id)) this.queuedCandidates.set(id, []);

      this.queuedCandidates.get(id)?.push(candidate);
    }
  }

  async shutdown(id: string) {
    this.logger.debug("Shutting down", { id });

    if (this.connections.has(id)) {
      this.logger.debug("Shutting down connection", { id });

      this.connections.get(id)?.close();

      this.connections.delete(id);

      this.logger.debug("Deleted connection", {
        newConnections: JSON.stringify(Array.from(this.connections.keys())),
      });
    }

    if (this.channels.has(id)) {
      this.logger.verbose("Shutting down channel", { id });

      if(this.channels.has(id)){
        this.channels.get(id).forEach((value: RTCDataChannel, key: string) => {
            value.close();
        });
      }

      this.channels.delete(id);

      this.logger.debug("Deleted channel", {
        newChannels: JSON.stringify(Array.from(this.connections.keys())),
      });
    }

    if (this.queuedCandidates.has(id)) {
      this.logger.debug("Removing queued candidates", { id });

      this.queuedCandidates.delete(id);

      this.logger.debug("Deleted queued candidate", {
        newQueuedCandidates: JSON.stringify(
          Array.from(this.queuedCandidates.keys())
        ),
      });
    }

    if (this.queuedMessages.has(id)) {
      this.logger.debug("Removing queued messages", { id });

      this.queuedMessages.delete(id);

      this.logger.debug("Deleted queued messages", {
        newQueuedMessages: JSON.stringify(
          Array.from(this.queuedMessages.keys())
        ),
      });
    }
  }

  async send(remoteId: string, localId: string, msg: Uint8Array) {
    this.logger.debug("Handling send Transporter", { remoteId, localId});
    let channel = undefined;

    if(this.channels.has(remoteId))
      channel = this.channels.get(remoteId).get(localId);

     while (
      !channel ||
      channel!.readyState !== "open" // Checked by !channel
    ) {
      await this.asyncResolver.once(this.getChannelKey(remoteId, localId));

      channel = this.channels.get(remoteId).get(localId);
    }
    channel!.send(msg); // We check above
    this.logger.debug("END SEND!!", { remoteId, localId});
    
  }

  async recv(remoteId: string, localId: string) {
    this.logger.debug("Handling receive Transporter", { remoteId, localId});

    if (
      this.queuedMessages.has(remoteId) &&
      this.queuedMessages.get(remoteId).has(localId) &&
      this.queuedMessages.get(remoteId).get(localId)?.length !== 0 // Checked by .has
    ) {
      this.logger.debug("Has queued messages!", { remoteId, localId});
      return this.queuedMessages.get(remoteId).get(localId)?.shift()!; // size !== 0 and undefined is ever pushed
    } else {
      const msg = await this.asyncResolver.once(this.getMessageKey(remoteId, localId));
      this.logger.debug("Received msg messages!", { remoteId, localId, msg});
      this.queuedMessages.get(remoteId).get(localId)?.shift();

      return msg! as Uint8Array;
    }
  }

  private async handleConnectionStatusChange(
    connectionState: string,
    id: string
  ) {
    this.logger.debug("Handling connection status change", {
      connectionState,
      id,
    });

    if (connectionState === "closed") {
      await this.onConnectionDisconnect(id);

      await this.shutdown(id);
    } else {
      connectionState === "connected" && (await this.onConnectionConnect(id));
    }
  }

  private async queueAndEmitMessage(remoteId: string,
                                    localId: string,
                                    rawMsg: ArrayBuffer
                                    ) {
    const msg = new Uint8Array(rawMsg);
    this.logger.silly("Queueing message", { remoteId, localId, msg});
    if (this.channels.has(remoteId) &&
            this.channels.get(remoteId).has(localId)) {

      const messages = this.queuedMessages.get(remoteId).get(localId);

      messages?.push(msg);
      await this.asyncResolver.emit(this.getMessageKey(remoteId, localId), msg);
    } else {
      throw new ChannelDoesNotExistError();
    }
  }

  private async addQueuedCandidates(id: string) {
    this.logger.silly("Queueing candidate", { id });

    this.queuedCandidates.get(id)?.forEach(async (candidate) => {
      this.queuedCandidates.set(
        id,
        this.queuedCandidates.get(id)?.filter((c) => c !== candidate)! // This only runs if it is not undefined
      );

      await this.handleCandidate(id, candidate);
    });

    this.logger.silly("Added queued candidate", {
      newQueuedCandidates: JSON.stringify(Array.from(this.queuedCandidates)),
    });
  }

  private getMessageKey(remoteId: string, localId: string) {
    this.logger.silly("Getting message key", { remoteId , localId});

    return `message remoteId=${remoteId}, localId=${localId}`;
  }

  private getChannelKey(remoteId: string, localId: string) {
    this.logger.silly("Getting channel key", { remoteId , localId});

    return `channel remoteId=${remoteId}, localId=${localId}`;
  }
}