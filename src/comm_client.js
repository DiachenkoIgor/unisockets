import DiscoveryClient from "../lib/discovery_client.js";
import NetworkInterface from "../lib/network_interface.js";

const ADDRESS = "ws://localhost:6999";

const networkInterface = new NetworkInterface.Builder()
  .setConfig({
    iceServers: [
      {
        url: "stun:global.stun.twilio.com:3478?transport=udp",
        urls: "stun:global.stun.twilio.com:3478?transport=udp",
      },
    ],
  })
  .setOnConnect((id, e) => console.log(id, "connected", e))
  .setOnReceive((id, e) => console.log(id, "received", e))
  .setOnDisconnect((id, e) => console.log(id, "disconnected", e))
  .build();

const discoveryClient = new DiscoveryClient.Builder()
  .setAddress(ADDRESS)
  .setGetOffer(async () => {
    const offerConnectionId = networkInterface.createConnection();
    const offerConnection = networkInterface.getConnectionById(
      offerConnectionId
    );
    const offer = await offerConnection.getOffer();

    console.log(`Offering ${offer}`);

    return { offer, offerConnectionId };
  })
  .setGetAnswer(async (offer) => {
    const answerConnectionId = networkInterface.createConnection();
    const answerConnection = networkInterface.getConnectionById(
      answerConnectionId
    );
    const answer = await answerConnection.getAnswer(offer);

    console.log(`Answering ${answer}`);

    return { answer, answerConnectionId };
  })
  .setOnAnswer((answer) => console.log(`Got answer`, answer))
  .build();

console.log(`Connecting to ${ADDRESS}`);

discoveryClient.connect();