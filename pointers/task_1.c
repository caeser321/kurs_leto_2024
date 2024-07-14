#include <stdio.h>
#include <locale.h>

int main() {
    setlocale(LC_ALL, "Russian");
    unsigned int num;
    unsigned char new_byte;

    printf("Введите целое число: ");
    scanf("%u", &num);

    while (1) {
        printf("Введите новое значение для третьего байта (0-255): ");
        scanf("%hhu", &new_byte);

        if (new_byte >= 0 && new_byte <= 255) {
            break;
        } else {
            printf("Некорректные данные. Введите значение от 0 до 255.\n");
        }
    }

    unsigned char *ptr = (unsigned char *)&num;
    ptr[2] = new_byte;

    printf("Измененное число: %u\n", num);

    return 0;
}
