// Recebe o som do microfone em pedaços pequenos e manda para a página.
class Gravador extends AudioWorkletProcessor {
  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (canal && canal.length) this.port.postMessage(canal.slice(0));
    return true;
  }
}
registerProcessor('gravador', Gravador);
