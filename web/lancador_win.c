// KOFnes.exe da versão sem Java: abre o KOFnes.html (o emulador Kof
// compilado pra JavaScript) numa janela de app do Edge, que vem em todo
// Windows 10/11, sem barra de endereço. Sem Edge, tenta o Chrome; sem os
// dois, abre no navegador padrão.
// Perfil próprio em %LOCALAPPDATA%\KOFnes\navegador: os saves, o tema e a
// pasta de ROMs ficam guardados lá.
#include <windows.h>
#include <shlwapi.h>
#include <stdio.h>

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
