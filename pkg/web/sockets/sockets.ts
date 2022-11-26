import { v4 } from "uuid";
import { MemoryDoesNotExistError } from "../signaling/errors/memory-does-not-exist";
import { SocketDoesNotExistError } from "../signaling/errors/socket-does-not-exist";
import { getAsBinary } from "../utils/getAsBinary";
import { htons } from "../utils/htons";
import { getLogger } from "../utils/logger";
import { Bind } from "./bind";

const AF_INET = 2;

// Matches pkg/unisockets/unisockets.h
interface ISocketImports {
  unisockets_socket: () => Promise<number>;
  unisockets_bind: (
    fd: number,
    addressPointer: number,
    addressLength: number
  ) => Promise<number>;
  unisockets_listen: () => Promise<number>;
  unisockets_accept: (
    fd: number,
    addressPointer: number,
    addressLengthPointer: number
  ) => Promise<number>;
  unisockets_connect: (
    fd: number,
    addressPointer: number,
    addressLength: number
  ) => Promise<number>;
  unisockets_send: (
    fd: number,
    messagePointer: number,
    messagePointerLength: number
  ) => Promise<number>;
  unisockets_recv: (
    fd: number,
    messagePointer: number,
    messagePointerLength: number
  ) => Promise<number>;
  unisockets_getsockname: (
    fd: number,
    namePointer: number,
    namePointerLength: number,
  ) => Promise<number>;
    unisockets_close: (
    fd: number
  ) => void;
}

export class Sockets {
  private logger = getLogger();
  public binds = new Map<number, Bind>();
  private clientAliases = new Map<number, string>();
  private memories = new Map<string, Uint8Array>();
  private Bind STUB = new Bind("stub","stub");
  constructor(
    private externalBind: (alias: string) => Promise<void>,
    private externalAccept: (alias: string) => Promise<string>,
    private externalConnect: (alias: string) => Promise<void>,
    private externalSend: (alias: string, connectorId: string, msg: Uint8Array) => Promise<void>,
    private externalRecv: (alias: string, connectorId: string) => Promise<Uint8Array>,
    private externalClose: (alias: string) => Promise<void>,
    private externalSocket: () => Promise<number>,
    private isConnected: () => boolean,
    private notifyBindSet: (fd: number, bind: Bind) => void,
    private updateBinds: () => Promise<Map<number, Bind>>
  ) {
  }

  getImports(): { memoryId: string; imports: ISocketImports } {
    this.logger.debug("Getting imports");

    const memoryId = v4();

    return {
      memoryId,
      imports: {
        unisockets_socket: async  () => {
          return await this.socket();
        },
        unisockets_close: (fd: number) => {
          try{
              this.close(fd).then((val) => this.logger.error("Closed"));
            }catch(e){
              this.logger.error("unisockets_close failed", { e });
            }
        },
        unisockets_bind: async (
          fd: number,
          addressPointer: number,
          addressLength: number
        ) => {
          try {
            const memory = await this.accessMemory(memoryId);
            const socketInMemory = memory.slice(
              addressPointer,
              addressPointer + addressLength
            );


            const addressInMemory = socketInMemory.slice(4, 8);
            const portInMemory = socketInMemory.slice(2, 4);
            const address = addressInMemory.join(".");

            const port = htons(new Uint16Array(portInMemory.buffer)[0]);

            await this.bind(fd, `${address}:${port}`);
            
            return 0;
          } catch (e) {
            this.logger.error("Bind failed", { e });

            return -1;
          }
        },
        unisockets_listen: async () => {
          return 0;
        },
        unisockets_accept: async (
          fd: number,
          addressPointer: number,
          addressLengthPointer: number
        ) => {
          try {
            const memory = await this.accessMemory(memoryId);

            const { clientFd, clientAlias } = await this.accept(fd);

            const addressLength = new Int32Array(
              memory.slice(addressLengthPointer, addressLengthPointer + 4)
            )[0];

            const parts = clientAlias.split(":");

            const familyInMemory = getAsBinary(AF_INET);
            const portInMemory = getAsBinary(parseInt(parts[1]));
            const addressInMemory = parts[0]
              .split(".")
              .map((e) => Uint8Array.from([parseInt(e)])[0]);

            for (let i = 0; i < addressLength; i++) {
              const index = addressPointer + i;

              if (i >= 0 && i < 2) {
                memory[index] = familyInMemory[i];
              } else if (i >= 2 && i < 4) {
                memory[index] = portInMemory[i - 2];
              } else if (i >= 4 && i < 8) {
                memory[index] = addressInMemory[i - 4];
              }
            }
            
            return clientFd;
          } catch (e) {
            this.logger.error("Accept failed", { e });

            return -1;
          }
        },
        unisockets_connect: async (
          fd: number,
          addressPointer: number,
          addressLength: number
        ) => {
          try {

            const memory = await this.accessMemory(memoryId);

            const socketInMemory = memory.slice(
              addressPointer,
              addressPointer + addressLength
            );

            const addressInMemory = socketInMemory.slice(4, 8);
            const portInMemory = socketInMemory.slice(2, 4);

            const address = addressInMemory.join(".");
            const port = htons(new Uint16Array(portInMemory.buffer)[0]);

            await this.connect(fd, `${address}:${port}`);

            return 0;
          } catch (e) {
            this.logger.error("Connect failed", { e });

            return -1;
          }
        },
        unisockets_send: async (
          fd: number,
          messagePointer: number,
          messagePointerLength: number
        ) => {
          try {
            const memory = await this.accessMemory(memoryId);

            const msg = memory.slice(
              messagePointer,
              messagePointer + messagePointerLength
            );

            await this.send(fd, msg);
            return msg.length;
          } catch (e) {
            this.logger.error("Send failed", { e });

            return -1;
          }
        },
        unisockets_recv: async (
          fd: number,
          messagePointer: number,
          messagePointerLength: number
        ) => {
          try {
            const memory = await this.accessMemory(memoryId);

            const msg = await this.recv(fd);

            msg.forEach((messagePart, index) => {
              // Don't write over the boundary
              if (index <= messagePointerLength) {
                memory[messagePointer + index] = messagePart;
              }
            });

            return msg.length;
          } catch (e) {
            this.logger.error("Recv failed", { e });

            return -1;
          }
        },
        unisockets_getsockname: async (
          fd: number,
          namePointer: number,
          namePointerLength: number,
        ) => {
          try {
          const memory = await this.accessMemory(memoryId);

          await this.ensureBound(fd);

          var socketName = this.binds.get(fd).alias;

          var array = new TextEncoder("utf-8").encode(socketName.split(":")[0]);

          array.forEach((messagePart, index) => {
              // Don't write over the boundary
              if (index <= namePointerLength) {
                memory[namePointer + index] = messagePart;
              }
            });

          return array.length;
          } catch (e) {
            this.logger.error("get_socket_name failed", { e });

            return -1;
          }
        },
      },
    };
  }

  private setBind(fd: number, alias: string){

    this.binds.set(fd, new Bind(alias, self.signalingClient.id));

    this.notifyBindSet(fd, this.binds.get(fd)!);
  }
  private async socket() {
    this.logger.silly("Handling `socket`");
    const fd = await this.externalSocket();

    this.binds.set(fd, this.STUB);

    return fd;
  }

  private async bind(fd: number, alias: string) {
    this.logger.silly("Handling `bind`", { fd, alias });

    await this.ensureBound(fd);
    
    await this.externalBind(alias);

    this.setBind(fd, alias);
  }

  private async accept(serverFd: number) {
    this.logger.silly("Handling `accept`", { serverFd });

    await this.ensureBound(serverFd);

    const clientFd = await this.socket();

    const clientAlias = await this.externalAccept(this.binds.get(serverFd)!.alias!); // ensureBound

    this.setBind(clientFd, clientAlias);

    return {
      clientFd,
      clientAlias,
    };
  }

  private async connect(serverFd: number, alias: string) {
    this.logger.silly("Handling `connect`", { serverFd, alias });

    await this.ensureBound(serverFd);

    this.setBind(serverFd, alias);
    const clientAlias = await this.externalConnect(alias);

    if(clientAlias != undefined && clientAlias.length > 0)
      this.clientAliases.set(serverFd, clientAlias);

    return clientAlias;
  }

  private async send(fd: number, msg: Uint8Array) {
    await this.ensureBound(fd);

    await this.externalSend(this.binds.get(fd).alias!, this.binds.get(fd).connectorId, msg); // ensureBound
  }

  private async close(fd: number) {
    this.logger.debug("Handling `close`", {fd});

    await this.ensureBound(fd);
    
    if(!this.clientAliases.has(fd)){
      if(this.binds.get(fd) != undefined)
        await this.externalClose(this.binds.get(fd).alias!);
    }
    else{
      await this.externalClose(this.clientAliases.get(fd));
    }
  }

  private async recv(fd: number) {
    await this.ensureBound(fd);

    return await this.externalRecv(this.binds.get(fd).alias!, this.binds.get(fd).connectorId); // ensureBound
  }

  private async ensureBound(fd: number) {
    this.logger.silly("Ensuring bound", { fd });

    if (!this.binds.has(fd)) {
      var binds = this.binds;
      (await this.updateBinds()).forEach(function(value, key) {
          binds.set(key, value);
      });

      if (!this.binds.has(fd))
        throw new SocketDoesNotExistError();
    }
  }

  async setMemory(memoryId: string, memory: Uint8Array) {
    this.logger.debug("Setting memory", { memoryId });

    this.memories.set(memoryId, memory);
  }

  private async accessMemory(memoryId: string) {
    this.logger.silly("Accessing memory", { memoryId });

    if (this.memories.has(memoryId)) {
      return new Uint8Array(this.memories.get(memoryId)!.buffer); // Checked by .has & we never push undefined
    } else {
      throw new MemoryDoesNotExistError();
    }
  }
}
