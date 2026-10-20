/* Núcleo SÓ DE SOM do KOFstation: o chip FM (YM2612) e o PSG (SN76489) do Genesis Plus GX, sem 68000, Z80 nem vídeo.
 * Toca a trilha (web/musicas/fm/trilha.py) direto da lista de comandos, a mesma que o tocador de 68000 lê da ROM:
 *   0 reg val = YM2612 parte I, 1 reg val = parte II, 2 val = PSG, 3 n = espera n quadros, 5 = marca o loop, 4 = volta.
 * O som sai igual ao do núcleo inteiro (mesmo código dos chips, mesmo relógio, mesmo reamostrador blip_buf), mas o
 * arquivo tem ~80 KB em vez de 3,8 MB. A sonda (kof_onda, do genplus-sonda.patch) alimenta o modo Ondas da jukebox.
 * Licença: a do Genesis Plus GX (só uso NÃO comercial), como o núcleo inteiro. */
#include "shared.h"
#include <stdlib.h>
#include <string.h>

t_config config;
t_snd snd;
int audio_hard_disable = 0;

#define QUADRO (262 * 3420)            /* ciclos do relógio mestre por quadro (Mega Drive NTSC) */
#define FM_RAZAO (7 * 6 * 24)          /* o YM2612 gera 1 amostra a cada 1008 ciclos do mestre (144 do 68000): ~53,3 kHz */

static int fm_buf[2 * 2048], fm_ult[2], fm_ini, fm_cont, *fm_ptr;
static unsigned char *cmd;
static int ncmd, pc, loop, espera;
static short saida[2 * 4096];

static void fm_ate(int ciclos)
{
  if (ciclos > fm_cont)
  {
    int n = (ciclos - fm_cont + FM_RAZAO - 1) / FM_RAZAO;
    YM2612Update(fm_ptr, n);
    fm_ptr += n * 2;
    fm_cont += n * FM_RAZAO;
  }
}

static void fim_quadro(int ciclos)
{
  int t = fm_ini, l, r, *p = fm_buf, al = fm_ult[0], ar = fm_ult[1];
  psg_end_frame(ciclos);
  fm_ate(ciclos);
  do
  {
    l = (*p++ * config.fm_preamp) / 100;
    r = (*p++ * config.fm_preamp) / 100;
    blip_add_delta(snd.blips[0], t, l - al, r - ar);
    al = l; ar = r;
    t += FM_RAZAO;
  } while (t < ciclos);
  fm_ptr = fm_buf;
  fm_ult[0] = al; fm_ult[1] = ar;
  fm_cont = fm_ini = t - ciclos;
  blip_end_frame(snd.blips[0], ciclos);
}

/* taxa de saída (ex.: 48000) */
void som_iniciar(int taxa)
{
  int i;
  memset(&config, 0, sizeof(config));
  config.psg_preamp = 150; config.fm_preamp = 100; config.hq_fm = 1; config.hq_psg = 1; config.ym2612 = YM2612_DISCRETE;
  for (i = 0; i < 4; i++) config.psg_ch_volumes[i] = 100;
  for (i = 0; i < 6; i++) config.md_ch_volumes[i] = 100;
  if (!snd.blips[0]) snd.blips[0] = blip_new(taxa / 10);
  blip_set_rates(snd.blips[0], MCLOCK_NTSC, taxa);
  YM2612Init();
  YM2612Config(YM2612_DISCRETE);
}

/* recomeça a música (lista de comandos já copiada pra memória do módulo) */
void som_tocar(unsigned char *comandos, int n)
{
  cmd = comandos; ncmd = n; pc = 0; loop = 0; espera = 0;
  YM2612ResetChip();
  psg_init(PSG_INTEGRATED);
  psg_reset();
  psg_config(0, config.psg_preamp, 0xff);
  blip_clear(snd.blips[0]);
  fm_ult[0] = fm_ult[1] = 0; fm_ini = fm_cont = 0; fm_ptr = fm_buf;
}

/* mudo por canal: bits 0-5 = FM, 6-9 = PSG */
void som_mudas(unsigned m)
{
  int i;
  for (i = 0; i < 6; i++) config.md_ch_volumes[i] = (m >> i) & 1 ? 0 : 100;
  for (i = 0; i < 4; i++) config.psg_ch_volumes[i] = (m >> (6 + i)) & 1 ? 0 : 100;
  psg_config(0, config.psg_preamp, 0xff);
}

/* roda um quadro (1/60 s) e devolve quantas amostras estéreo ficaram em som_saida() */
int som_quadro(void)
{
  int t = 0;
  while (cmd && !espera && pc < ncmd)
  {
    int c = cmd[pc++];
    if (c == 0 || c == 1)
    {
      if (pc + 1 >= ncmd) break;
      fm_ate(t); YM2612Write(c * 2, cmd[pc]);
      fm_ate(t); YM2612Write(c * 2 + 1, cmd[pc + 1]);
      pc += 2;
    }
    else if (c == 2) psg_write(t, cmd[pc++]);
    else if (c == 3) espera = cmd[pc++];
    else if (c == 5) loop = pc;
    else if (c == 4) pc = loop;
    t += 128;   /* cada escrita leva um tempinho, como no 68000 */
  }
  if (espera) espera--;
  fim_quadro(QUADRO);
  return blip_read_samples(snd.blips[0], saida, blip_samples_avail(snd.blips[0]));   /* sem conferência: pedir a mais estoura */
}

short *som_saida(void) { return saida; }

/* sonda: definida no ym2612.c remendado */
extern int kof_sonda;
extern short kof_onda[];
extern unsigned kof_ondaPosC[];
short *som_onda(void) { kof_sonda = 1; return kof_onda; }
unsigned *som_onda_pos(void) { return kof_ondaPosC; }
