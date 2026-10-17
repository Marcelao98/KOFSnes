// Download pelo WinINet (a pilha de rede do Edge/Explorer: usa o mesmo proxy e as mesmas
// configurações). Fica em arquivo separado porque o wininet.h do mingw briga com o winhttp.h.
#include <windows.h>
#include <wininet.h>
#include <stdio.h>

// baixa url pra destino; devolve os bytes, ou -1 (e *codigo = erro do Windows, ou o status HTTP se *http = 1)
long long inet_baixar(const wchar_t *url, const wchar_t *destino, unsigned long *codigo, int *http) {
    long long total = -1;
    *http = 0; *codigo = 0;
    HINTERNET s = InternetOpenW(L"KOFnes", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!s) { *codigo = GetLastError(); return -1; }
    DWORD t1 = 10000, t2 = 20000;
    InternetSetOptionW(s, INTERNET_OPTION_CONNECT_TIMEOUT, &t1, sizeof(t1));
    InternetSetOptionW(s, INTERNET_OPTION_RECEIVE_TIMEOUT, &t2, sizeof(t2));
    HINTERNET r = InternetOpenUrlW(s, url, NULL, 0, INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_NO_UI, 0);
    if (!r) { *codigo = GetLastError(); InternetCloseHandle(s); return -1; }
    DWORD st = 0, tam = sizeof(st);
    HttpQueryInfoW(r, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, &st, &tam, NULL);
    if (st == 200) {
        FILE *f = _wfopen(destino, L"wb");
        if (f) {
            char buf[16384]; DWORD lido = 0; total = 0;
            while (InternetReadFile(r, buf, sizeof(buf), &lido) && lido > 0) { fwrite(buf, 1, lido, f); total += lido; }
            fclose(f);
        } else *codigo = GetLastError();
    } else { *http = 1; *codigo = st; }
    InternetCloseHandle(r); InternetCloseHandle(s);
    return total;
}
