import { ESIGNALING_OPCODES, ISignalingOperation } from "./operation";

export interface IAcceptData {
  boundAlias: string;
  clientAlias: string;
  clientId: string;
  alias: string;
}

export class Accept implements ISignalingOperation<IAcceptData> {
  opcode = ESIGNALING_OPCODES.ACCEPT;

  constructor(public data: IAcceptData) {}
}
