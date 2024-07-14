#include <stdio.h>
#include <locale.h>

void printBinary(unsigned int num) {
    int bits = sizeof(num) * 8;
    for (int i = bits - 1; i >= 0; i--) {
        if (num & (1 << i)) {
            printf("1");
        } else {
            printf("0");
        }
    }
    printf("\n");
}

int main() {
    setlocale(LC_ALL, "Russian");  

    unsigned int number;
    
    printf("Введите целое положительное число: ");
    scanf("%u", &number);
    
    printf("Двоичное число: ");
    printBinary(number);

    return 0;
}


