#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <locale.h>

#define MAX_NAME_LENGTH 10
#define MAX_TEL_LENGTH 10

struct abonent {
    char name[MAX_NAME_LENGTH];
    char second_name[MAX_NAME_LENGTH];
    char tel[MAX_TEL_LENGTH];
};

void clearBuffer() {
    int c;
    while ((c = getchar()) != '\n' && c != EOF);
}

void addAbonent(struct abonent **abonents, int *count) {
    struct abonent newAbonent;

    printf("Введите имя: ");
    fgets(newAbonent.name, sizeof(newAbonent.name), stdin);
    newAbonent.name[strcspn(newAbonent.name, "\n")] = '\0';

    printf("Введите фамилию: ");
    fgets(newAbonent.second_name, sizeof(newAbonent.second_name), stdin);
    newAbonent.second_name[strcspn(newAbonent.second_name, "\n")] = '\0';

    printf("Введите телефон: ");
    fgets(newAbonent.tel, sizeof(newAbonent.tel), stdin);
    newAbonent.tel[strcspn(newAbonent.tel, "\n")] = '\0';

    *abonents = realloc(*abonents, (*count + 1) * sizeof(struct abonent));
    if (*abonents == NULL) {
        printf("Ошибка выделения памяти.\n");
        return;
    }

    (*abonents)[*count] = newAbonent;
    (*count)++;
    printf("Абонент добавлен.\n");
}

void deleteAbonent(struct abonent **abonents, int *count) {
    if (*count == 0) {
        printf("Справочник пуст. Удаление невозможно.\n");
        return;
    }

    char nameToDelete[MAX_NAME_LENGTH];
    printf("Введите имя абонента для удаления: ");
    fgets(nameToDelete, sizeof(nameToDelete), stdin);
    nameToDelete[strcspn(nameToDelete, "\n")] = '\0';

    int found = 0;
    for (int i = 0; i < *count; i++) {
        if (strcmp((*abonents)[i].name, nameToDelete) == 0) {
            (*abonents)[i] = (*abonents)[*count - 1];
            found = 1;
            (*count)--;
            break;
        }
    }

    if (found) {
        *abonents = realloc(*abonents, *count * sizeof(struct abonent));
        if (*count > 0 && *abonents == NULL) {
            printf("Ошибка освобождения памяти.\n");
            exit(EXIT_FAILURE);
        }
        printf("Абонент удален.\n");
    } else {
        printf("Абонент с именем '%s' не найден.\n", nameToDelete);
    }
}

void searchAbonent(struct abonent *abonents, int count) {
    if (count == 0) {
        printf("Справочник пуст. Поиск невозможен.\n");
        return;
    }

    char nameToSearch[MAX_NAME_LENGTH];
    printf("Введите имя абонента для поиска: ");
    fgets(nameToSearch, sizeof(nameToSearch), stdin);
    nameToSearch[strcspn(nameToSearch, "\n")] = '\0';

    int found = 0;
    printf("Результаты поиска:\n");
    for (int i = 0; i < count; i++) {
        if (strcmp(abonents[i].name, nameToSearch) == 0) {
            printf("Имя: %s, Фамилия: %s, Телефон: %s\n", abonents[i].name, abonents[i].second_name, abonents[i].tel);
            found = 1;
        }
    }

    if (!found) {
        printf("Абонент с именем '%s' не найден.\n", nameToSearch);
    }
}

void printAllAbonents(struct abonent *abonents, int count) {
    if (count == 0) {
        printf("Справочник пуст. Нет записей для вывода.\n");
        return;
    }

    printf("Список всех абонентов:\n");
    for (int i = 0; i < count; i++) {
        printf("Имя: %s, Фамилия: %s, Телефон: %s\n", abonents[i].name, abonents[i].second_name, abonents[i].tel);
    }
}

int main() {
    setlocale(LC_ALL, "Russian");
    struct abonent *abonents = NULL;
    int count = 0;
    int choice;

    while (1) {
        printf("\nМеню:\n");
        printf("1) Добавить абонента\n");
        printf("2) Удалить абонента\n");
        printf("3) Поиск абонентов по имени\n");
        printf("4) Вывод всех записей\n");
        printf("5) Выход\n");
        printf("Выберите действие: ");
        scanf("%d", &choice);
        clearBuffer(); // от лишних символов

        switch (choice) {
            case 1:
                addAbonent(&abonents, &count);
                break;
            case 2:
                deleteAbonent(&abonents, &count);
                break;
            case 3:
                searchAbonent(abonents, count);
                break;
            case 4:
                printAllAbonents(abonents, count);
                break;
            case 5:
                printf("Выход из программы.\n");
                free(abonents);
                return 0;
            default:
                printf("Некорректный ввод. Пожалуйста, выберите действие из меню (1-5).\n");
                break;
        }
    }

    return 0;
}
