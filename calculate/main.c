// main.c

#include <stdio.h>
#include "calc.h"

int main() {
    int choice;
    int a, b;

    while (1) {
        printf("\nМеню:\n");
        printf("1) Сложение\n");
        printf("2) Вычитание\n");
        printf("3) Умножение\n");
        printf("4) Деление\n");
        printf("5) Выход\n");
        printf("Выберите действие: ");
        scanf("%d", &choice);

        if (choice < 1 || choice > 5) {
            printf("Некорректный выбор. Пожалуйста, выберите от 1 до 5.\n");
            continue;
        }

        if (choice == 5) {
            printf("Выход из программы.\n");
            break;
        }

        printf("Введите два целых числа: ");
        scanf("%d %d", &a, &b);

        switch (choice) {
            case 1:
                printf("Результат сложения: %d\n", add(a, b));
                break;
            case 2:
                printf("Результат вычитания: %d\n", subtract(a, b));
                break;
            case 3:
                printf("Результат умножения: %d\n", multiply(a, b));
                break;
            case 4:
                if (b == 0) {
                    printf("Ошибка: деление на ноль.\n");
                } else {
                    printf("Результат деления: %d\n", divide(a, b));
                }
                break;
            default:
                printf("Некорректный выбор.\n");
                break;
        }
    }

    return 0;
}
