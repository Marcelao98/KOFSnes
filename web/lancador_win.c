// KOFnes.exe da versão sem Java: abre o KOFnes.html (o emulador Kof
// compilado pra JavaScript) numa janela de app do Edge, que vem em todo
// Windows 10/11, sem barra de endereço. Sem Edge, tenta o Chrome; sem os
// dois, abre no navegador padrão.
// Perfil próprio em %LOCALAPPDATA%\KOFnes\navegador: os saves, o tema e a
// pasta de ROMs ficam guardados lá.
//
// Atualizador: antes de abrir, lê publicado/versao.txt do GitHub. Se o número
// de lá for maior que o do versao.txt daqui, baixa o KOFnes.html novo, confere
// o tamanho e o começo do arquivo, e troca. Sem internet (ou se o GitHub
// demorar), abre a versão que já tem. Os saves não moram no KOFnes.html, então
// trocar o arquivo não mexe neles. Um arquivo "nao-atualizar" do lado do .exe
// desliga isso.
#include <windows.h>
#include <shlwapi.h>
#include <urlmon.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define PUBLICADO L"https://raw.githubusercontent.com/Marcelao98/KOFSnes/main/publicado/"

typedef struct {
    wchar_t dir[MAX_PATH];
    volatile LONG baixando;   // 1 = achou versão nova e está baixando o KOFnes.html
} Atualizacao;

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

static DWORD WINAPI atualizar(LPVOID arg) {
    Atualizacao *a = (Atualizacao *)arg;
    wchar_t url[512], vNova[MAX_PATH], vAqui[MAX_PATH], hNovo[MAX_PATH], hAqui[MAX_PATH];
    swprintf(vNova, MAX_PATH, L"%ls\\versao.txt.novo", a->dir);
    swprintf(vAqui, MAX_PATH, L"%ls\\versao.txt", a->dir);
    swprintf(hNovo, MAX_PATH, L"%ls\\KOFnes.html.novo", a->dir);
    swprintf(hAqui, MAX_PATH, L"%ls\\KOFnes.html", a->dir);
    swprintf(url, 512, PUBLICADO L"versao.txt?t=%lu", GetTickCount());
    if (URLDownloadToFileW(NULL, url, vNova, 0, NULL) != S_OK) return 0;
    long long nova = campo(vNova, "versao="), aqui = campo(vAqui, "versao="), tam = campo(vNova, "tamanho=");
    if (nova <= aqui || tam <= 0) { DeleteFileW(vNova); return 0; }
    InterlockedExchange(&a->baixando, 1);
    swprintf(url, 512, PUBLICADO L"KOFnes.html?t=%lu", GetTickCount());
    if (URLDownloadToFileW(NULL, url, hNovo, 0, NULL) != S_OK) { DeleteFileW(vNova); return 0; }
    // confere: o tamanho anunciado e o começo de uma página do KOFnes
    WIN32_FILE_ATTRIBUTE_DATA d;
    char ini[16] = { 0 };
    FILE *f = _wfopen(hNovo, L"rb");
    if (f) { fread(ini, 1, 15, f); fclose(f); }
    int ok = GetFileAttributesExW(hNovo, GetFileExInfoStandard, &d)
        && (((long long)d.nFileSizeHigh << 32) | d.nFileSizeLow) == tam
        && _strnicmp(ini, "<!doctype html", 14) == 0;
    if (ok && MoveFileExW(hNovo, hAqui, MOVEFILE_REPLACE_EXISTING)) {
        MoveFileExW(vNova, vAqui, MOVEFILE_REPLACE_EXISTING);
    } else {
        DeleteFileW(hNovo);
        DeleteFileW(vNova);
    }
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

    // atualizador: espera até 3 s pra saber se tem versão nova; se tiver, até 20 s pra baixar
    wchar_t trava[MAX_PATH];
    swprintf(trava, MAX_PATH, L"%ls\\nao-atualizar", dir);
    if (GetFileAttributesW(trava) == INVALID_FILE_ATTRIBUTES) {
        static Atualizacao at;
        wcscpy(at.dir, dir);
        at.baixando = 0;
        HANDLE t = CreateThread(NULL, 0, atualizar, &at, 0, NULL);
        if (t) {
            if (WaitForSingleObject(t, 3000) == WAIT_TIMEOUT && at.baixando) WaitForSingleObject(t, 20000);
            CloseHandle(t);
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
        return 0;
    }

    if (!GetEnvironmentVariableW(L"LOCALAPPDATA", local, MAX_PATH)) wcscpy(local, dir);
    swprintf(perfil, MAX_PATH, L"%ls\\KOFnes", local);
    CreateDirectoryW(perfil, NULL);
    wcscat(perfil, L"\\navegador");
    swprintf(linha, MAX_PATH * 6,
             L"\"%ls\" --app=\"%ls\" --user-data-dir=\"%ls\" --no-first-run --no-default-browser-check "
             L"--autoplay-policy=no-user-gesture-required --window-size=840,780",
             nav, url, perfil);
    STARTUPINFOW si = { sizeof(si) };
    PROCESS_INFORMATION pi;
    if (!CreateProcessW(NULL, linha, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) {
        ShellExecuteW(NULL, L"open", html, NULL, dir, SW_SHOWNORMAL);
        return 0;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
