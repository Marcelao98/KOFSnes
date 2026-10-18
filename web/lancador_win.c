// KOFnes.exe: abre o KOFnes.html (o emulador Kof
// compilado pra JavaScript) numa janela de app do Edge, que vem em todo
// Windows 10/11, sem barra de endereço. Sem Edge, tenta o Chrome; sem os
// dois, abre no navegador padrão.
// Perfil próprio em %LOCALAPPDATA%\KOFnes\navegador: os saves, o tema e a
// pasta de ROMs ficam guardados lá.
//
// Atualizador: ao abrir, lê publicado/versao.txt do GitHub. Testa os IPs do
// GitHub ao mesmo tempo e baixa pelo curl.exe do Windows no que respondeu
// (tem rede que só alcança um dos quatro); de reserva, WinINet e WinHTTP.
// Se a versão de lá for maior que a do versao.txt daqui,
// baixa o KOFnes.html novo, confere tamanho e começo do arquivo e troca. Se
// "lancador=" de lá for maior que LANCADOR, troca também este .exe (o Windows
// deixa renomear um .exe em uso: o velho vira KOFnes.exe.old e some na próxima
// vez). Sem internet abre o que tem; se o download demorar, abre o jogo e
// termina por trás (vale na próxima vez). Tudo fica anotado em
// atualizacao.log. Os saves não moram aqui, então trocar os arquivos não mexe
// neles. Um arquivo "nao-atualizar" do lado do .exe desliga isso.
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shlwapi.h>
#include <winhttp.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>

#define LANCADOR 5
#define HOST L"raw.githubusercontent.com"
#define CAMINHO L"/Marcelao98/KOFSnes/main/publicado/"
#ifndef WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY
#define WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY 4
#endif

typedef struct {
    wchar_t dir[MAX_PATH];
    volatile LONG baixando;   // 1 = achou versão nova e está baixando
} Atualizacao;

static FILE *registro = NULL;

static void anotar(const char *fmt, ...) {
    if (!registro) return;
    time_t t = time(NULL);
    struct tm *l = localtime(&t);
    fprintf(registro, "%02d:%02d:%02d  ", l->tm_hour, l->tm_min, l->tm_sec);
    va_list ap;
    va_start(ap, fmt);
    vfprintf(registro, fmt, ap);
    va_end(ap);
    fputc('\n', registro);
    fflush(registro);
}

// lê "campo=número" de um versao.txt (0 se não tem)
static long long campo(const wchar_t *arq, const char *nome) {
    FILE *f = _wfopen(arq, L"rb");
    if (!f) return 0;
    char b[1024] = { 0 };
    fread(b, 1, sizeof(b) - 1, f);
    fclose(f);
    char *p = strstr(b, nome);
    return p ? _strtoi64(p + strlen(nome), NULL, 10) : 0;
}

static int comecaCom(const wchar_t *arq, const char *ini) {
    char b[32] = { 0 };
    FILE *f = _wfopen(arq, L"rb");
    if (!f) return 0;
    fread(b, 1, strlen(ini), f);
    fclose(f);
    return _strnicmp(b, ini, strlen(ini)) == 0;
}

// baixa https://HOST/CAMINHO<nome> pra destino pelo WinHTTP; devolve os bytes baixados ou -1
static long long baixar_winhttp(const wchar_t *nome, const wchar_t *destino) {
    HINTERNET s = WinHttpOpen(L"KOFnes", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!s) s = WinHttpOpen(L"KOFnes", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!s) { anotar("WinHttpOpen falhou (erro %lu)", GetLastError()); return -1; }
    WinHttpSetTimeouts(s, 8000, 3000, 15000, 20000);
    long long total = -1;
    HINTERNET c = WinHttpConnect(s, HOST, INTERNET_DEFAULT_HTTPS_PORT, 0);
    wchar_t caminho[512];
    swprintf(caminho, 512, CAMINHO L"%ls?t=%lu", nome, GetTickCount());
    HINTERNET r = c ? WinHttpOpenRequest(c, L"GET", caminho, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE) : NULL;
    if (r && WinHttpSendRequest(r, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) && WinHttpReceiveResponse(r, NULL)) {
        DWORD st = 0, tam = sizeof(st);
        WinHttpQueryHeaders(r, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_HEADER_NAME_BY_INDEX, &st, &tam, WINHTTP_NO_HEADER_INDEX);
        if (st == 200) {
            FILE *f = _wfopen(destino, L"wb");
            if (f) {
                char buf[16384];
                DWORD lido = 0;
                total = 0;
                while (WinHttpReadData(r, buf, sizeof(buf), &lido) && lido > 0) {
                    fwrite(buf, 1, lido, f);
                    total += lido;
                }
                fclose(f);
            } else {
                anotar("não consegui criar o arquivo (erro %lu): a pasta deixa gravar?", GetLastError());
            }
        } else {
            anotar("GitHub respondeu %lu pra %ls", st, nome);
        }
    } else {
        anotar("sem conexão com o GitHub (erro %lu)", GetLastError());
    }
    if (r) WinHttpCloseHandle(r);
    if (c) WinHttpCloseHandle(c);
    WinHttpCloseHandle(s);
    return total;
}

// Pelo WinINet (lancador_inet.c): é a pilha de rede do Edge/Explorer, então usa o mesmo proxy e as
// mesmas configurações do navegador (o WinHTTP, em algumas redes, dava timeout 12002 com o Edge funcionando).
extern long long inet_baixar(const wchar_t *url, const wchar_t *destino, unsigned long *codigo, int *http);
static long long baixar_inet(const wchar_t *nome, const wchar_t *destino) {
    wchar_t url[600];
    swprintf(url, 600, L"https://" HOST CAMINHO L"%ls?t=%lu", nome, GetTickCount());
    unsigned long cod; int http;
    long long b = inet_baixar(url, destino, &cod, &http);
    if (b < 0) {
        if (http) anotar("WinINet: GitHub respondeu %lu pra %ls", cod, nome);
        else anotar("WinINet: falhou (erro %lu) pra %ls", cod, nome);
    }
    return b;
}

// Tem rede que só alcança alguns dos IPs do GitHub (aqui: 1 de 4) e o IPv6 não sai; o WinHTTP e o
// WinINet tentam um IP de cada vez e travam no primeiro morto (12002). Então: pede os IPv4 ao DNS,
// conecta em todos ao mesmo tempo e fica com o primeiro que responder (o Edge faz igual).
// Escolhe uma vez só; os downloads seguintes usam o mesmo.
static char ipBom[64];
static int ipTestado = 0;

static const char *escolher_ip(void) {
    if (ipTestado) return ipBom[0] ? ipBom : NULL;
    ipTestado = 1;
    WSADATA w;
    if (WSAStartup(MAKEWORD(2, 2), &w) != 0) { anotar("WSAStartup falhou"); return NULL; }
    struct addrinfo dica = { 0 }, *lista = NULL;
    dica.ai_family = AF_INET;
    dica.ai_socktype = SOCK_STREAM;
    int e = getaddrinfo("raw.githubusercontent.com", "443", &dica, &lista);
    if (e != 0) { anotar("DNS não achou o GitHub (erro %d)", e); return NULL; }
    SOCKET s[8];
    char ips[8][64];
    int n = 0;
    for (struct addrinfo *p = lista; p && n < 8; p = p->ai_next) {
        SOCKET k = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (k == INVALID_SOCKET) continue;
        u_long sim = 1;
        ioctlsocket(k, FIONBIO, &sim);
        connect(k, p->ai_addr, (int)p->ai_addrlen);
        inet_ntop(AF_INET, &((struct sockaddr_in *)p->ai_addr)->sin_addr, ips[n], sizeof(ips[n]));
        s[n++] = k;
    }
    freeaddrinfo(lista);
    DWORD ini = GetTickCount();
    int vivos = n;
    while (!ipBom[0] && vivos > 0) {
        long resta = 2500 - (long)(GetTickCount() - ini);
        if (resta <= 0) break;
        fd_set ok, erro;
        FD_ZERO(&ok); FD_ZERO(&erro);
        for (int i = 0; i < n; i++) if (s[i] != INVALID_SOCKET) { FD_SET(s[i], &ok); FD_SET(s[i], &erro); }
        struct timeval tv = { resta / 1000, (resta % 1000) * 1000 };
        if (select(0, NULL, &ok, &erro, &tv) <= 0) break;
        for (int i = 0; i < n; i++) {
            if (s[i] == INVALID_SOCKET) continue;
            if (FD_ISSET(s[i], &ok) && !ipBom[0]) {
                strcpy(ipBom, ips[i]);
            } else if (FD_ISSET(s[i], &erro)) {
                closesocket(s[i]); s[i] = INVALID_SOCKET; vivos--;
            }
        }
    }
    for (int i = 0; i < n; i++) if (s[i] != INVALID_SOCKET) closesocket(s[i]);
    WSACleanup();
    if (ipBom[0]) anotar("IP do GitHub: %s (de %d; respondeu em %lu ms)", ipBom, n, GetTickCount() - ini);
    else anotar("nenhum dos %d IPs do GitHub respondeu em 2,5 s", n);
    return ipBom[0] ? ipBom : NULL;
}

// pelo curl.exe do Windows (10/11), preso no IP que respondeu; o certificado continua conferido pelo nome
static long long baixar_curl(const wchar_t *nome, const wchar_t *destino) {
    const char *ip = escolher_ip();
    if (!ip) return -1;
    wchar_t curl[MAX_PATH], linha[2048];
    if (!GetSystemDirectoryW(curl, MAX_PATH)) return -1;
    wcscat(curl, L"\\curl.exe");
    if (GetFileAttributesW(curl) == INVALID_FILE_ATTRIBUTES) { anotar("sem curl.exe no Windows"); return -1; }
    swprintf(linha, 2048, L"\"%ls\" -sSf -4 --connect-timeout 5 --max-time 60 --resolve " HOST L":443:%hs "
             L"-o \"%ls\" \"https://" HOST CAMINHO L"%ls?t=%lu\"", curl, ip, destino, nome, GetTickCount());
    STARTUPINFOW si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi;
    if (!CreateProcessW(curl, linha, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        anotar("não consegui rodar o curl.exe (erro %lu)", GetLastError());
        return -1;
    }
    DWORD saida = 1;
    if (WaitForSingleObject(pi.hProcess, 70000) == WAIT_TIMEOUT) TerminateProcess(pi.hProcess, 1);
    GetExitCodeProcess(pi.hProcess, &saida);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    WIN32_FILE_ATTRIBUTE_DATA info;
    if (saida != 0 || !GetFileAttributesExW(destino, GetFileExInfoStandard, &info)) {
        anotar("curl: falhou (saída %lu) pra %ls", saida, nome);
        return -1;
    }
    long long b = ((long long)info.nFileSizeHigh << 32) | info.nFileSizeLow;
    anotar("curl: baixou %ls (%lld bytes)", nome, b);
    return b;
}

// tenta o curl no IP que respondeu; se não der, o WinINet e depois o WinHTTP
static long long baixar(const wchar_t *nome, const wchar_t *destino) {
    long long b = baixar_curl(nome, destino);
    if (b > 0) return b;
    anotar("tentando pelo WinINet");
    b = baixar_inet(nome, destino);
    if (b > 0) return b;
    anotar("tentando de novo pelo WinHTTP");
    return baixar_winhttp(nome, destino);
}

static DWORD WINAPI atualizar(LPVOID arg) {
    Atualizacao *a = (Atualizacao *)arg;
    wchar_t vNova[MAX_PATH], vAqui[MAX_PATH], hNovo[MAX_PATH], hAqui[MAX_PATH];
    wchar_t eNovo[MAX_PATH], eAqui[MAX_PATH], eVelho[MAX_PATH];
    swprintf(vNova, MAX_PATH, L"%ls\\versao.txt.novo", a->dir);
    swprintf(vAqui, MAX_PATH, L"%ls\\versao.txt", a->dir);
    swprintf(hNovo, MAX_PATH, L"%ls\\KOFnes.html.novo", a->dir);
    swprintf(hAqui, MAX_PATH, L"%ls\\KOFnes.html", a->dir);
    swprintf(eNovo, MAX_PATH, L"%ls\\KOFnes.exe.novo", a->dir);
    swprintf(eAqui, MAX_PATH, L"%ls\\KOFnes.exe", a->dir);
    swprintf(eVelho, MAX_PATH, L"%ls\\KOFnes.exe.old", a->dir);
    long long aqui = campo(vAqui, "versao=");
    anotar("KOFnes.exe (lançador %d) · versão daqui: %lld", LANCADOR, aqui);
    if (baixar(L"versao.txt", vNova) <= 0) { DeleteFileW(vNova); return 0; }
    long long nova = campo(vNova, "versao="), tamHtml = campo(vNova, "tamanho="), lanc = campo(vNova, "lancador="), tamExe = campo(vNova, "tamanho_exe=");
    anotar("versão no GitHub: %lld (lançador %lld)", nova, lanc);
    int trocouHtml = 0;
    if (nova > aqui && tamHtml > 0) {
        InterlockedExchange(&a->baixando, 1);
        long long b = baixar(L"KOFnes.html", hNovo);
        if (b != tamHtml || !comecaCom(hNovo, "<!doctype html")) {
            anotar("KOFnes.html veio errado (%lld bytes, esperava %lld): fica a versão daqui", b, tamHtml);
            DeleteFileW(hNovo);
        } else if (!MoveFileExW(hNovo, hAqui, MOVEFILE_REPLACE_EXISTING)) {
            anotar("não consegui trocar o KOFnes.html (erro %lu): a pasta deixa gravar?", GetLastError());
            DeleteFileW(hNovo);
        } else {
            trocouHtml = 1;
            anotar("atualizado pra versão %lld", nova);
        }
    } else {
        anotar("já está na versão mais nova");
    }
    if (lanc > LANCADOR && tamExe > 0) {
        InterlockedExchange(&a->baixando, 1);
        long long b = baixar(L"KOFnes.exe", eNovo);
        if (b == tamExe && comecaCom(eNovo, "MZ")) {
            DeleteFileW(eVelho);
            if (MoveFileExW(eAqui, eVelho, MOVEFILE_REPLACE_EXISTING) && MoveFileExW(eNovo, eAqui, MOVEFILE_REPLACE_EXISTING)) {
                anotar("KOFnes.exe atualizado pro lançador %lld (vale na próxima vez)", lanc);
            } else {
                anotar("não consegui trocar o KOFnes.exe (erro %lu)", GetLastError());
                MoveFileExW(eVelho, eAqui, 0);
                DeleteFileW(eNovo);
            }
        } else {
            anotar("KOFnes.exe veio errado (%lld bytes, esperava %lld)", b, tamExe);
            DeleteFileW(eNovo);
        }
    }
    if (trocouHtml || nova <= aqui) MoveFileExW(vNova, vAqui, MOVEFILE_REPLACE_EXISTING);
    else DeleteFileW(vNova);
    return 0;
}

static int acharNavegador(const wchar_t *exe, wchar_t *saida, DWORD tam) {
    wchar_t chave[256];
    swprintf(chave, 256, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\%ls", exe);
    HKEY raizes[2] = { HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE };
    for (int i = 0; i < 2; i++) {
        DWORD t = tam * sizeof(wchar_t);
        if (RegGetValueW(raizes[i], chave, NULL, RRF_RT_REG_SZ, NULL, saida, &t) == ERROR_SUCCESS
                && GetFileAttributesW(saida) != INVALID_FILE_ATTRIBUTES) {
            return 1;
        }
    }
    return 0;
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmd, int show) {
    (void)inst; (void)prev; (void)cmd; (void)show;
    wchar_t dir[MAX_PATH], html[MAX_PATH], url[MAX_PATH * 3], nav[MAX_PATH];
    wchar_t perfil[MAX_PATH], local[MAX_PATH], linha[MAX_PATH * 6];
    DWORD n = MAX_PATH * 3;
    GetModuleFileNameW(NULL, dir, MAX_PATH);
    wchar_t *barra = wcsrchr(dir, L'\\');
    if (barra) *barra = 0;
    swprintf(html, MAX_PATH, L"%ls\\KOFnes.html", dir);
    if (GetFileAttributesW(html) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(NULL, L"Não achei o KOFnes.html do lado do KOFnes.exe.\n"
                          L"Extraia a pasta inteira antes de abrir.", L"KOFnes", MB_ICONERROR);
        return 1;
    }

    // atualizador: até 8 s pra saber se tem versão nova; se tiver, até mais 30 s pra
    // baixar. Passou disso, abre o jogo e termina o download por trás.
    wchar_t trava[MAX_PATH], log[MAX_PATH], velho[MAX_PATH];
    swprintf(trava, MAX_PATH, L"%ls\\nao-atualizar", dir);
    swprintf(log, MAX_PATH, L"%ls\\atualizacao.log", dir);
    swprintf(velho, MAX_PATH, L"%ls\\KOFnes.exe.old", dir);
    DeleteFileW(velho);
    HANDLE t = NULL;
    static Atualizacao at;
    if (GetFileAttributesW(trava) == INVALID_FILE_ATTRIBUTES) {
        // o registro vai acumulando (as últimas execuções), pra dar pra ver o que aconteceu em cada abertura
        WIN32_FILE_ATTRIBUTE_DATA info;
        int grande = GetFileAttributesExW(log, GetFileExInfoStandard, &info) && info.nFileSizeLow > 32768;
        registro = _wfopen(log, grande ? L"w" : L"a");
        anotar("---- abrindo (pasta: %ls)", dir);
        wcscpy(at.dir, dir);
        at.baixando = 0;
        t = CreateThread(NULL, 0, atualizar, &at, 0, NULL);
        // sem pressa: rede lenta não pode fazer o lançador desistir de atualizar
        if (t && WaitForSingleObject(t, 15000) == WAIT_TIMEOUT) {
            anotar("a verificação passou de 15 s (%s)", at.baixando ? "já baixando" : "ainda procurando");
            if (at.baixando) WaitForSingleObject(t, 60000);
        }
    }
    if (UrlCreateFromPathW(html, url, &n, 0) != S_OK) return 1;

    int achou = acharNavegador(L"msedge.exe", nav, MAX_PATH);
    if (!achou) {
        const wchar_t *padroes[] = { L"ProgramFiles(x86)", L"ProgramFiles" };
        for (int i = 0; i < 2 && !achou; i++) {
            wchar_t base[MAX_PATH];
            if (GetEnvironmentVariableW(padroes[i], base, MAX_PATH)) {
                swprintf(nav, MAX_PATH, L"%ls\\Microsoft\\Edge\\Application\\msedge.exe", base);
                achou = GetFileAttributesW(nav) != INVALID_FILE_ATTRIBUTES;
            }
        }
    }
    if (!achou) achou = acharNavegador(L"chrome.exe", nav, MAX_PATH);
    if (!achou) {
        ShellExecuteW(NULL, L"open", html, NULL, dir, SW_SHOWNORMAL);
    } else {
        if (!GetEnvironmentVariableW(L"LOCALAPPDATA", local, MAX_PATH)) wcscpy(local, dir);
        swprintf(perfil, MAX_PATH, L"%ls\\KOFnes", local);
        CreateDirectoryW(perfil, NULL);
        wcscat(perfil, L"\\navegador");
        swprintf(linha, MAX_PATH * 6,
                 L"\"%ls\" --app=\"%ls\" --user-data-dir=\"%ls\" --no-first-run --no-default-browser-check "
                 L"--autoplay-policy=no-user-gesture-required --window-size=840,780",
                 nav, url, perfil);
        STARTUPINFOW si;
        ZeroMemory(&si, sizeof(si));
        si.cb = sizeof(si);
        PROCESS_INFORMATION pi;
        if (CreateProcessW(NULL, linha, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) {
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
        } else {
            ShellExecuteW(NULL, L"open", html, NULL, dir, SW_SHOWNORMAL);
        }
    }
    // o download ainda não acabou: termina por trás (sem janela) e vale na próxima vez
    if (t) {
        if (WaitForSingleObject(t, 0) == WAIT_TIMEOUT) {
            anotar("o download continua por trás; a versão nova vale na próxima vez que abrir");
            WaitForSingleObject(t, 180000);
        }
        CloseHandle(t);
    }
    if (registro) fclose(registro);
    return 0;
}
