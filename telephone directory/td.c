#include <stdio.h>
#include <string.h>
#include <locale.h>

#define MAX_ABONENTS 100
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

void addAbonent(struct abonent abonents[], int *count) {
    if (*count >= MAX_ABONENTS) {
        printf("Справочник переполнен. Нельзя добавить больше абонентов.\n");
        return;
    }

    printf("Введите имя: ");
    fgets(abonents[*count].name, sizeof(abonents[*count].name), stdin);
    abonents[*count].name[strcspn(abonents[*count].name, "\n")] = '\0';

    printf("Введите фамилию: ");
    fgets(abonents[*count].second_name, sizeof(abonents[*count].second_name), stdin);
    abonents[*count].second_name[strcspn(abonents[*count].second_name, "\n")] = '\0';

    printf("Введите телефон: ");
    fgets(abonents[*count].tel, sizeof(abonents[*count].tel), stdin);
    abonents[*count].tel[strcspn(abonents[*count].tel, "\n")] = '\0';

    (*count)++;
    printf("Абонент добавлен.\n");
}

void deleteAbonent(struct abonent abonents[], int *count) {
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
        if (strcmp(abonents[i].name, nameToDelete) == 0) {
            abonents[i].name[0] = '\0';
            abonents[i].second_name[0] = '\0';
            abonents[i].tel[0] = '\0';
            found = 1;
            printf("Абонент удален.\n");
            break;
        }
    }

    if (!found) {
        printf("Абонент с именем '%s' не найден.\n", nameToDelete);
    }
}

void searchAbonent(struct abonent abonents[], int count) {
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

void printAllAbonents(struct abonent abonents[], int count) {
    if (count == 0) {
        printf("Справочник пуст. Нет записей для вывода.\n");
        return;
    }

    printf("Список всех абонентов:\n");
    for (int i = 0; i < count; i++) {
        if (abonents[i].name[0] != '\0') {
            printf("Имя: %s, Фамилия: %s, Телефон: %s\n", abonents[i].name, abonents[i].second_name, abonents[i].tel);
        }
    }
}

int main() {
    setlocale(LC_ALL, "Russian");
    struct abonent abonents[MAX_ABONENTS];
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
                addAbonent(abonents, &count);
                break;
            case 2:
                deleteAbonent(abonents, &count);
                break;
            case 3:
                searchAbonent(abonents, count);
                break;
            case 4:
                printAllAbonents(abonents, count);
                break;
            case 5:
                printf("Выход из программы.\n");
                return 0;
            default:
                printf("Некорректный ввод. Пожалуйста, выберите действие из меню (1-5).\n");
                break;
        }
    }

    return 0;
}
