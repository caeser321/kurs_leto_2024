#include <stdio.h>
#include <locale.h>

int main() {
    setlocale(LC_ALL, "Russian");  

    unsigned int number;
    unsigned char newByte;
    int validInput;

    do {
        validInput = 1; 

        printf("Введите целое положительное число: ");
        if (scanf("%u", &number) != 1) {
            printf("Некорректный ввод. Число должно быть положительное.\n");
            validInput = 0;
            while (getchar() != '\n');  
            continue;
        }

        printf("Введите новое значение для третьего байта: ");
        if (scanf("%hhu", &newByte) != 1 || newByte > 255) {
            printf("Некорректный ввод. Значения от 0 до 255.\n");
            validInput = 0;
            while (getchar() != '\n');  
        }

    } while (!validInput);

    number &= ~(0xFF << 16);  
    
    number |= newByte << 16;
    
    printf("Новое число: %u\n", number);

    return 0;
}
