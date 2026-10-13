/* KOFnes.exe — lançador do Windows.
 * Roda runtime\bin\javaw.exe -jar kofnes.jar [rom] a partir da pasta do .exe,
 * sem janela de console. Arrastar uma ROM em cima do .exe abre ela direto.
 * Saída e erros do Java vão pra kofnes.log, do lado do .exe. */
#include <windows.h>
#include <wchar.h>

static void erro(const wchar_t *msg) {
    MessageBoxW(NULL, msg, L"KOFnes", MB_OK | MB_ICONERROR);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prev, PWSTR cmd, int show) {
    (void)inst; (void)prev; (void)show;
    static wchar_t dir[MAX_PATH], java[MAX_PATH + 64], jar[MAX_PATH + 64], logp[MAX_PATH + 64];
    static wchar_t linha[32768];
    GetModuleFileNameW(NULL, dir, MAX_PATH);
    wchar_t *barra = wcsrchr(dir, L'\\');
    if (barra) *barra = 0;
    swprintf(java, MAX_PATH + 64, L"%ls\\runtime\\bin\\javaw.exe", dir);
    swprintf(jar, MAX_PATH + 64, L"%ls\\kofnes.jar", dir);
    swprintf(logp, MAX_PATH + 64, L"%ls\\kofnes.log", dir);
    if (GetFileAttributesW(java) == INVALID_FILE_ATTRIBUTES) {
        erro(L"Não achei a pasta 'runtime' do lado do KOFnes.exe.\nExtraia o .zip inteiro antes de abrir.");
        return 1;
    }
    // KOFNES_JAVA_OPCOES: opções extras da JVM (usado pra medir as classes
    // que o Java carrega, na hora de podar o pacote)
    const wchar_t *extra = _wgetenv(L"KOFNES_JAVA_OPCOES");
    swprintf(linha, 32768, L"\"%ls\" -Xss16m -Dfile.encoding=UTF-8 -Dsun.java2d.d3d=false %ls -jar \"%ls\" %ls",
             java, extra ? extra : L"", jar, cmd ? cmd : L"");

    SECURITY_ATTRIBUTES sa = { sizeof(sa), NULL, TRUE };
    HANDLE log = CreateFileW(logp, GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    if (log != INVALID_HANDLE_VALUE) {
        si.dwFlags = STARTF_USESTDHANDLES;
        si.hStdOutput = log;
        si.hStdError = log;
        si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    }
    if (!CreateProcessW(NULL, linha, NULL, NULL, TRUE, 0, NULL, dir, &si, &pi)) {
        erro(L"Não consegui iniciar o Java embutido (runtime\\bin\\javaw.exe).");
        return 1;
    }
    /* espera o emulador fechar: se ele morrer logo de cara, mostra o log */
    DWORD r = WaitForSingleObject(pi.hProcess, 4000);
    DWORD code = 0;
    if (r == WAIT_OBJECT_0 && GetExitCodeProcess(pi.hProcess, &code) && code != 0) {
        erro(L"O KOFnes fechou com erro logo ao abrir.\nVeja o arquivo kofnes.log na pasta do programa.");
    }
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return 0;
}
