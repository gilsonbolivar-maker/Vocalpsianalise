# Prompt para o Google AI Studio — Vocalpsianalise (análise da voz)

Crie um aplicativo web chamado **Vocalpsianalise**, todo em português do Brasil, para apoiar psicólogas na análise de sessões gravadas. O app analisa **o que a pessoa diz** e **como ela diz**: o tom, a entonação, o ritmo, as pausas e a emoção presentes na voz. O objetivo é ajudar a psicóloga a perceber sentimentos que aparecem na voz e que nem sempre estão nas palavras.

== 1. LIMITES E ÉTICA (obrigatório) ==
- O app NÃO faz diagnóstico. Ele levanta hipóteses e sinais para a psicóloga investigar. Toda tela de resultado deve dizer: "Documento de apoio. Hipóteses a confirmar pelo profissional responsável."
- Nunca afirme um sentimento como fato. Use sempre linguagem de hipótese: "a voz sugere", "há sinais de", "pode indicar".
- Toda percepção deve vir com a evidência na voz (por exemplo: "voz mais baixa e lenta, pausas longas antes de responder") e um grau de confiança: baixa, média ou alta.
- Antes de qualquer análise, exija a confirmação: "O paciente foi informado e concordou com a gravação e a análise desta sessão." Sem isso, o botão de análise fica desativado.
- Mostre um aviso de fase de teste: "Use só com dados fictícios até a ferramenta ser validada."
- Não guarde áudio nem resultado em servidor. Tudo fica só na tela até a psicóloga exportar ou apagar. Ofereça um botão "Apagar tudo desta sessão".
- A chave da API do Gemini não pode ficar exposta no navegador. Use o servidor do próprio AI Studio (proxy) para as chamadas.
- Mostre esta nota na tela de configurações: "Para uso com pacientes reais, a conta da API deve estar num plano pago, em que os dados não são usados para treinar modelos, e o uso deve seguir a LGPD."

== 2. ENTRADA DO ÁUDIO ==
- Forma principal: a psicóloga grava a sessão no app Gravador do iPad ou do celular, salva em Arquivos e escolhe o arquivo no app. Aceite m4a, mp3, wav e aac.
- Forma secundária, marcada como experimental: gravar direto pelo navegador. No iPad, o áudio deve ser ligado no momento do toque no botão, por causa da regra do Safari.
- Sessões longas, de até 60 minutos: divida o áudio em blocos de cerca de 5 minutos, cortando em pausas, com 3 segundos de sobreposição, e analise um bloco por vez, mostrando o progresso: "Analisando bloco 3 de 12".
- Use o modelo Gemini mais recente que entenda áudio diretamente, enviando o áudio (não só o texto), para que o modelo perceba o tom de voz.

== 3. O QUE ANALISAR ==
Para cada trecho de fala, analise três camadas:

**Camada 1: o que é dito (conteúdo verbal)**
- Transcrição fiel, com marcação de tempo (minuto:segundo).
- Separação de quem fala: "Psicóloga" e "Paciente". Analise emoções só da fala do paciente.
- Temas principais do trecho.

**Camada 2: como é dito (voz e prosódia)**
- Tom e entonação: voz monótona ou achatada, voz variada, subidas ou quedas de tom no fim das frases.
- Intensidade: voz baixa, normal ou alta, e mudanças bruscas.
- Velocidade da fala: lenta, normal ou acelerada, e mudanças ao longo da sessão.
- Pausas: pausas longas, silêncios antes de responder (latência), frases interrompidas.
- Qualidade da voz: voz trêmula, embargada, tensa, cansada, sussurrada.
- Sinais não verbais audíveis: choro, suspiro, riso, riso nervoso, respiração ofegante, engolir seco, gaguejar, hesitações ("é…", "hum…").

**Camada 3: o encontro das duas (congruência)**
- Aponte quando o que é dito e o tom da voz não combinam. Exemplo: "Diz 'estou bem', mas a voz fica embargada e baixa."
- Aponte os momentos de maior carga emocional da sessão, com o tempo e o trecho.

**Emoções a considerar**, cada uma com intensidade de 0 a 3 e confiança: tristeza, ansiedade ou medo, raiva ou irritação, culpa ou vergonha, desesperança, apatia ou desânimo, alegria ou alívio, tensão, confusão, neutro.

**Medidas objetivas da voz**, calculadas no próprio aparelho (Web Audio), para apoiar a análise do modelo e mostrar em gráfico:
- Altura média da voz (frequência fundamental) e quanto ela varia.
- Volume médio e quanto ele varia.
- Proporção de silêncio e duração média das pausas.
- Velocidade aproximada da fala.

== 4. CUIDADOS PARA NÃO ERRAR ==
- Use os primeiros minutos da fala do paciente como **linha de base**: compare o paciente com ele mesmo, não com um padrão geral.
- Considere e cite, quando for o caso, o que pode alterar a voz sem ter a ver com emoção: sotaque regional, jeito de falar da pessoa, cansaço, gripe, medicação, condições como autismo, Parkinson ou depressão (que mudam a prosódia), ruído e qualidade da gravação.
- Se o áudio estiver ruim, diga isso e reduza a confiança da análise.
- Não invente emoções em trechos curtos ou sem fala clara.

== 5. SINAIS PARA A PSICÓLOGA INVESTIGAR ==
- Ligue os achados a áreas de investigação clínica, sem dar diagnóstico. Exemplos: humor, ansiedade, sono, energia, interesse e prazer, autoestima, concentração, irritabilidade, uso de substâncias, trauma, relações.
- Para cada sinal, mostre: a área, o trecho com o tempo, o que foi dito, como foi dito, e uma sugestão de pergunta para a próxima sessão.

== 6. ALERTA DE RISCO ==
- Se o paciente falar em morte, suicídio, se machucar, desesperança intensa ou falta de saída, ou se a voz e o conteúdo juntos indicarem desespero, mostre um **alerta vermelho fixo no topo**, com o trecho e o tempo, e os contatos: CVV 188 e SAMU 192.
- O alerta deve dizer que a avaliação do risco cabe à psicóloga.

== 7. FORMATO DOS DADOS ==
Para cada trecho, gere um JSON com:
inicio, fim, falante, transcricao, temas, emocoes (lista com emocao, intensidade, confianca, evidencias_na_voz), marcadores_da_voz (tom, intensidade, velocidade, pausas, qualidade_da_voz, sinais_nao_verbais), congruencia (combina ou nao_combina, e explicacao), sinais_para_investigar (area, justificativa, pergunta_sugerida), alerta_de_risco (sim ou não, e motivo).
Valide o JSON antes de mostrar. Se vier incompleto, refaça a chamada uma vez.

== 8. TELAS ==
O app deve funcionar bem no iPad e no celular, com letras grandes e botões grandes.
1. **Início:** aviso de fase de teste, consentimento, botão "Escolher gravação" e, abaixo, "Gravar ao vivo (experimental)".
2. **Processando:** barra de progresso por bloco e o texto aparecendo conforme fica pronto.
3. **Resultado**, em abas:
   - **Transcrição:** texto com tempos, separado por falante, com os trechos de maior emoção destacados em cor.
   - **Emoções na voz:** linha do tempo da sessão, com um gráfico das emoções e da intensidade ao longo dos minutos.
   - **Voz:** gráficos das medidas objetivas (altura, volume, pausas, velocidade) ao longo da sessão.
   - **Incongruências:** lista dos momentos em que fala e tom não combinam.
   - **Sinais para investigar:** lista por área, com trecho, tempo e pergunta sugerida.
   - **Resumo:** um parágrafo curto com o panorama emocional da sessão, os momentos-chave e as perguntas sugeridas.
4. **Exportar:** relatório em PDF e em texto, com o aviso de documento de apoio no fim, e o JSON completo, para levar depois ao app Anamnese PSI.

== 9. TECNOLOGIA ==
- React com TypeScript.
- Cálculo das medidas de voz no navegador, sem enviar nada além do necessário para o Gemini.
- Tratamento de erros em português: arquivo inválido, falta de internet, limite da API, áudio sem fala.

== 10. ENTREGA ==
- Antes de mostrar o resultado, teste com 3 casos fictícios: uma fala neutra, uma fala triste com pausas longas e uma fala em que o paciente diz que está bem com a voz embargada (incongruência).
- No fim, explique em uma lista curta o que foi feito e o que ainda precisa ser validado por uma psicóloga.
