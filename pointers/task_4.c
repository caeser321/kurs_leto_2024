#include <stdio.h>
#include <string.h>
#include <ctype.h>

// проверка на то, чтобы человек не вводил цифры
int containsDigit(char *str) {
    for (int i = 0; str[i] != '\0'; i++) {
        if (isdigit((unsigned char)str[i])) {
            return 1;
        }
    }
    return 0;
}

int main() {
    char str[100];
    char substr[100];

    do {
        printf("Введите строку (не должно содержать цифр): ");
        fgets(str, sizeof(str), stdin);
        str[strcspn(str, "\n")] = '\0';

        if (containsDigit(str)) {
            printf("Строка содержит цифры. Попробуйте снова.\n");
        }
    } while (containsDigit(str));

    do {
        printf("Введите подстроку (не должно содержать цифр): ");
        fgets(substr, sizeof(substr), stdin);
        substr[strcspn(substr, "\n")] = '\0';

        if (containsDigit(substr)) {
            printf("Подстрока содержит цифры. Попробуйте снова.\n");
        }
    } while (containsDigit(substr));

    char *result = strstr(str, substr);

    if (result) {
        printf("Подстрока найдена. Указатель на начало подстроки: %p\n", result);
        printf("Начальная позиция подстроки: %ld\n", result - str);
    } else {
        printf("Подстрока не найдена. Указатель: %p\n", result);
    }

    return 0;
}
