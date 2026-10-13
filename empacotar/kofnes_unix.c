/* KOFnes — lançador do Linux: roda runtime/bin/java -jar kofnes.jar [rom]
 * a partir da pasta onde o executável está. */
#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    char self[PATH_MAX], dir[PATH_MAX], java[PATH_MAX + 32], jar[PATH_MAX + 32];
    ssize_t n = readlink("/proc/self/exe", self, sizeof(self) - 1);
    if (n < 0) { perror("readlink"); return 1; }
    self[n] = 0;
    strcpy(dir, self);
    strcpy(dir, dirname(dir));
    snprintf(java, sizeof(java), "%s/runtime/bin/java", dir);
    snprintf(jar, sizeof(jar), "%s/kofnes.jar", dir);
    char **av = calloc(argc + 6, sizeof(char *));
    int k = 0;
    av[k++] = java;
    av[k++] = "-Xss16m";
    av[k++] = "-Dfile.encoding=UTF-8";
    av[k++] = "-jar";
    av[k++] = jar;
    for (int i = 1; i < argc; i++) av[k++] = argv[i];
    av[k] = NULL;
    execv(java, av);
    fprintf(stderr, "KOFnes: não consegui rodar %s (extraiu o pacote inteiro?)\n", java);
    return 1;
}
