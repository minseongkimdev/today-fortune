const fetch = require('node-fetch')
const { parseDocument } = require('htmlparser2')
const { findAll, textContent } = require('domutils')
const fs = require('fs')
const path = require('path')

const SEARCH_URL = "https://www.joongang.co.kr/search?keyword=%EC%98%A4%EB%8A%98%EC%9D%98%20%EC%9A%B4%EC%84%B8"
const PROXY = "https://corsproxy.io/?"
const TIMEOUT = 15000
const MAX_RETRIES = 2
const OUTPUT_DIR = 'output'

const ANIMALS = {
    RAT: "쥐",
    OX: "소",
    TIGER: "호랑이",
    RABBIT: "토끼",
    DRAGON: "용",
    SNAKE: "뱀",
    HORSE: "말",
    SHEEP: "양",
    MONKEY: "원숭이",
    ROOSTER: "닭",
    DOG: "개",
    PIG: "돼지"
}

const fetchWithTimeout = async (url) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT)
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        })
        clearTimeout(timeoutId)
        return response
    } catch (err) {
        clearTimeout(timeoutId)
        throw err
    }
}

const getKoreanDate = () => {
    const now = new Date()
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
    const koreanTime = new Date(utc + (9 * 3600000))
    
    const year = koreanTime.getFullYear()
    const month = String(koreanTime.getMonth() + 1).padStart(2, '0')
    const day = String(koreanTime.getDate()).padStart(2, '0')
    
    return {
        dateStr: `${parseInt(month)}월 ${parseInt(day)}일`,
        fileName: `${year}${month}${day}.json`
    }
}

const parseBirthYearFortunes = (text) => {
    const fortunes = {}
    const matches = text.matchAll(/(\d{2})년생\s+([^.]+)\./g)
    
    for (const match of matches) {
        const year = match[1]
        const fortune = match[2].trim()
        fortunes[year] = fortune
    }
    
    return fortunes
}

const parseFortune = (text) => {
    // Split text by multiple spaces
    const parts = text.split(/\s{2,}/).filter(part => part.trim())
    if (parts.length < 2) {
        throw new Error(`운세 텍스트 파싱 실패: ${text}`)
    }

    // Parse basic info (animal, 재물, 건강, 사랑, 길방)
    const basicInfo = parts[0]
    const basicInfoMatch = basicInfo.match(/^(.+) - 재물 : (.+) 건강 : (.+) 사랑 : (.+) 길방 : ([東西南北]{1,2})$/)
    if (!basicInfoMatch) {
        throw new Error(`운세 기본 정보 파싱 실패: ${basicInfo}`)
    }

    const [, animal, money, health, love, direction] = basicInfoMatch

    // Get content (나머지 부분)
    const content = parts.slice(1).join('   ')

    // Parse birth year fortunes if content contains them
    const birthYearFortunes = parseBirthYearFortunes(content)

    // Convert Korean animal name to enum
    const animalKey = Object.entries(ANIMALS).find(([, value]) => value === animal)?.[0]
    if (!animalKey) {
        throw new Error(`알 수 없는 동물: ${animal}`)
    }

    return {
        animal: ANIMALS[animalKey],
        재물: money.trim(),
        건강: health.trim(),
        사랑: love.trim(),
        길방: direction.trim(),
        본문: content.trim(),
        년생운세: birthYearFortunes
    }
}

const run = async () => {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR)
    }

    let retry = 0
    while (retry <= MAX_RETRIES) {
        try {
            const { dateStr, fileName } = getKoreanDate()
            const today = new Date()
            const dateStr2 = `${today.getMonth() + 1}월 ${today.getDate()}일`
            console.log("dateStr", dateStr)
            console.log("dateStr2", dateStr2)
            console.log("today", today)


            const searchRes = await fetchWithTimeout(PROXY + encodeURIComponent(SEARCH_URL))
            const searchHtml = await searchRes.text()
            const searchDoc = parseDocument(searchHtml)

            const cards = findAll(e => e.attribs?.class === "card", searchDoc)
            let articleUrl = ""
            for (const card of cards) {
                const headlines = findAll(e => e.attribs?.class === "headline", card)
                for (const h of headlines) {
                    const links = findAll(e => e.name === "a", h)
                    for (const link of links) {
                        const title = textContent(link).trim()
                        if (title.includes(`[오늘의 운세] ${dateStr}`)) {
                            articleUrl = link.attribs?.href || ""
                            break
                        }
                    }
                    if (articleUrl) break
                }
                if (articleUrl) break
            }

            if (!articleUrl) throw new Error("오늘의 운세 기사 없음")

            const articleRes = await fetchWithTimeout(PROXY + encodeURIComponent(articleUrl))
            const articleHtml = await articleRes.text()
            const articleDoc = parseDocument(articleHtml)

            const fortunes = []
            for (let i = 2; i <= 13; i++) {
                const elems = findAll(
                    el => el.name === "p" && el.attribs?.["data-divno"] === String(i),
                    articleDoc
                )
                for (const el of elems) {
                    const text = textContent(el).trim()
                    if (text) {
                        try {
                            fortunes.push(parseFortune(text))
                            break
                        } catch (err) {
                            console.error(`❌ ${i}번째 운세 파싱 실패:`, err.message)
                            console.error('원본 텍스트:', text)
                            throw err
                        }
                    }
                }
            }

            if (fortunes.length === 0) throw new Error("운세 텍스트 없음")

            const outputPath = path.join(OUTPUT_DIR, fileName)
            fs.writeFileSync(outputPath, JSON.stringify({
                date: dateStr,
                fortunes
            }, null, 2), "utf-8")

            console.log(`✅ 운세 데이터 저장 완료: ${outputPath}`)
            return
        } catch (err) {
            console.error(`❌ 실패 (시도 ${retry + 1}):`, err.message)
            if (++retry > MAX_RETRIES) {
                process.exit(1)
            }
            await new Promise(r => setTimeout(r, 1000 * retry))
        }
    }
}

run()
