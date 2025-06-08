export enum Animal {
  RAT = "쥐",
  OX = "소",
  TIGER = "호랑이",
  RABBIT = "토끼",
  DRAGON = "용",
  SNAKE = "뱀",
  HORSE = "말",
  SHEEP = "양",
  MONKEY = "원숭이",
  ROOSTER = "닭",
  DOG = "개",
  PIG = "돼지"
}

export interface Fortune {
  animal: Animal;
  재물: string;
  건강: string;
  사랑: string;
  길방: string;
  본문: string;
} 