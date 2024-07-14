#include <stdio.h>
#include <locale.h>

int countOnes(unsigned int num) {
    int count = 0;
    while (num) {
        count += num & 1;  
        num >>= 1;         
    }
    return count;
}

int main() {
    setlocale(LC_ALL, "Russian");  

    unsigned int number;
    
    printf("Введите целое положительное число: ");
    scanf("%u", &number);
    
    int onesCount = countOnes(number);
    
    printf("Количество единиц в двоичном представлении числа: %d\n", onesCount);

    return 0;
}
