import Koa from 'koa';
const app = new Koa();

import dotenv from 'dotenv';
dotenv.config();

import SteamAPI from 'steamapi';
const steam = new SteamAPI(process.env.API_KEY);

import Handlebars from 'handlebars';
import moment from 'moment';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60 * 5 });

function isValidSteamURL(url) {
    const profileRegex = /^https:\/\/steamcommunity\.com\/profiles\/.+$/;
    const idRegex = /^https:\/\/steamcommunity\.com\/id\/.+$/;
    return profileRegex.test(url) || idRegex.test(url);
}

function mapUserLevel(level, id) {
    let levelDetails = { level0: false, level10: false, level20: false, levelT: false, levelG: false };
    if (level < 10) {
        levelDetails.level0 = true;
    } else if (level >= 10 && level < 20) {
        levelDetails.level10 = true;
    } else if (level >= 20 && level < 30) {
        levelDetails.level20 = true;
    } else if (level >= 30) {
        levelDetails.levelT = true;
    }
    // Example for admin logic
    if (id === "76561199103486871" || id === "76561198426601542") {
        levelDetails.levelG = true;
    }
    return levelDetails;
}

function mapPersonaState(state) {
    switch (state) {
        case 0: return "Private";
        case 1: return "Online";
        case 2: return "Busy";
        case 3: return "Away";
        case 4: return "Snooze";
        case 5: return "Looking to Trade";
        default: return "Looking to Play";
    }
}

function roundT(num) {
    var m = Number((Math.abs(num) * 10).toPrecision(15));
    return Math.round(m) / 10 * Math.sign(num);
}

function contains(arr, val) {
    return arr.some(function(arrVal) {
    return val === arrVal;
    });
}

function banned(bans) {
    return (bans.communityBanned == true || bans.vacBanned == true || bans.vacBans > 0 || bans.gameBans > 0 || bans.economyBan == "banned");
}

function gamesOwned(NoGamesOwned, games) {
    try {
        if (games.length > 0) {
            NoGamesOwned = false;
        } else if (games.length <= 0) {
            NoGamesOwned = true;
        }
    } catch (error) {
        NoGamesOwned = true;
    }
}

app.use(async ctx => {

    const __dirname = path.dirname(new URL(import.meta.url).pathname);

    if (ctx.request.query.login) {

        let url = ctx.request.query.login;

        if (!isValidSteamURL(url)) {
            let file = await fs.readFile(__dirname + "/templates/profile-set.html", "UTF-8");
            return;
        }
        let id = await steam.resolve(url);

        const cachedUserData = cache.get(id);
        if (cachedUserData) {
            console.log('Cache hit');
            let file = await fs.readFile(__dirname + "/templates/webpage-input.html", "UTF-8");
            const template = Handlebars.compile(file);
            ctx.body = (template(cachedUserData));
            return;
        }

        let bans = await steam.getUserBans(id);
        let player = await steam.getGamePlayers('730');
        let summary = await steam.getUserSummary(id);
        let featuredGames = await steam.getFeaturedGames();
        let level = await steam.getUserLevel(id);
        let creationDate = moment.unix(summary.createdTimestamp).format("MMM Do YYYY");
        let lastOnline = moment.unix(summary.lastLogOffTimestamp).format("MMM Do YYYY");
        let daysSinceBan = bans.daysSinceLastBan;
        let isBanned = banned(bans);
        let games = await steam.getUserOwnedGames(id);

        let admin = false;
        if (id == "76561199103486871" || id == "76561198426601542") admin = true;
        let levelDetails;
        mapUserLevel(level,id);
        
        let privateProfile = false;
        let personaState = mapPersonaState(summary.personaState);
        if (personaState=="Private") privateProfile = true;

        let NoGamesOwned = false;
        gamesOwned(NoGamesOwned, games);

        const gameIDList = [];
        let gameDetails;
        const gamesWithoutApps = [];
        const gameGenres = [];
        const gameGenresAmount = [];
        const gameFree = [true, false];
        const gameFreeAmount = [];
        const gameCategories = [];
        const gameCategoriesAmount = [];
        const RecommendationScore = [];
        const RecommendedGames = [];
        let calcTotal = 0;
        let gameTimeTotal = 0;
        let gameTimeNew = 0;
        let level0 = false;
        let level10 = false;
        let level20 = false;
        let levelT = false;
        let levelG = false;
        let friends;
        let friendsPrivate = false;
        let gamesPrivate = false;
        let online = false;
        let gameLengthVars = {
            gameLength0: false,
            gameLength1: false,
            gameLength2: false,
            gameLength3: false,
            gameLength4: false,
            gameLength5: false,
            gameLength6: false,
            gameLength7: false,
            gameLength8: false,
            gameLength9: false,
        };
        let gameLengthFull = false;

        console.log(summary);

        if (summary.visible == true && bans.communityBanned == false && NoGamesOwned == false) {
            if (bans.communityBanned == true || bans.vacBanned == true || bans.vacBans > 0 || bans.gameBans > 0 || bans.economyBan == "banned") {
                isBanned = true;
                let file = await fs.readFile(__dirname + "/templates/banned.html", "UTF-8");
                const template = Handlebars.compile(file);
                ctx.body = (template({ ban: bans, url: url }));
            }

            try {
                friends = await steam.getUserFriends(id);
            } catch (error) {
                friendsPrivate = true
            }

            try {
                games = await steam.getUserOwnedGames(id);

                for (let x = 0; x < games.length; x++) {
                    if (games[x].minutes > 0) {
                        try {

                            gameTimeTotal = gameTimeTotal + games[x].minutes;

                            if (games[x].minutes < 10*60) {
                                games[x].minutes = roundT(games[x].minutes/60);
                            } else {
                                games[x].minutes = Math.round(games[x].minutes/60);
                            }
                        } catch(error) {
                            console.log(error);
                        }
                    }
                    if (games[x].recentMinutes > 0) {
                        try {

                            gameTimeNew = gameTimeNew + games[x].recentMinutes;

                            if (games[x].recentMinutes < 10*60) {
                                games[x].recentMinutes = roundT(games[x].recentMinutes/60);
                            } else {
                                games[x].recentMinutes = Math.round(games[x].recentMinutes/60);
                            }
                        } catch(error) {
                            console.log(error);
                        }
                    }
                }

                games.sort(function(b, a){return (a.minutes) - (b.minutes)});
                games.sort(function(b, a){return (a.recentMinutes) - (b.recentMinutes)});

                gameTimeTotal = roundT(gameTimeTotal/60);
                gameTimeNew = roundT(gameTimeNew/60);

                for (let x = 0; x < games.length; x++) {
                    gameIDList.push(games[x].game.id.toString());
                }

                for (let x = 0; x < 11; x++) {
                    try {
                        gameDetails = await steam.getGameDetails(gameIDList[x], [false]);
                        if (gameDetails.name == "Apex Legends™") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "The Witcher® 3: Wild Hunt") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Terraria") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Aim Lab") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Dota Underlords") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Conqueror's Blade") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "SMITE®") {
                            gameDetails.background_raw = gameDetails.screenshots[1].path_full
                        }
                        if (gameDetails.name == "Path of Exile") {
                            gameDetails.background_raw = gameDetails.screenshots[14].path_full
                        }
                        if (gameDetails.name == "RISK: Global Domination") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Rust") {
                            gameDetails.background_raw = gameDetails.screenshots[2].path_full
                        }
                        if (gameDetails.name == "Unturned") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "The Forest") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Garry's Mod") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "F1® 2021") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "Bloons TD Battles 2") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        if (gameDetails.name == "LEGO® Star Wars™: The Skywalker Saga") {
                            gameDetails.background_raw = gameDetails.screenshots[0].path_full
                        }
                        
                        if (gameDetails.type == 'game' && gameDetails.background_raw != "" && !gamesWithoutApps.some(game => game.name == gameDetails.name)) {
                            try {
                                await axios.get(gameDetails.background_raw)
                            } catch (error) {
                                gameDetails.background_raw = gameDetails.screenshots[0].path_thumbnail 
                            }
                            gamesWithoutApps.push(gameDetails);
                        }

                        if (contains(gameGenres, gameDetails.genres[0].description) == false) {
                            gameGenres.push(gameDetails.genres[0].description);
                        } else if (gameDetails.genres[0].description == gameGenres[0]) {
                            gameGenresAmount[0]
                        }

                        if (contains(gameCategories, gameDetails.categories[0].description) == false) {
                            gameCategories.push(gameDetails.categories[0].description);
                        } else if (gameDetails.categories[0].description == gameCategories[0]) {
                            gameCategoriesAmount[0]
                        }
                        
                    } catch (error) {
                        console.log(error);
                    }
                }

                
                for (let x = 0; x < gameGenres.length; x++) {
                    gameGenresAmount.push(0);
                }
                for (let x = 0; x < gamesWithoutApps.length; x++) {
                    gameDetails = await steam.getGameDetails(gameIDList[x], [false]);
                    for (let y = 0; y < gameGenres.length; y++) {
                        if (gameGenres[y] == gameDetails.genres[0].description) {
                            gameGenresAmount[y] = gameGenresAmount[y] + 1;
                        }
                    }
                    calcTotal = calcTotal + 1;
                }
                for (let x = 0; x < gameGenresAmount.length; x++) {
                    gameGenresAmount[x] = Math.round((gameGenresAmount[x] / calcTotal) * 100);
                }


                for (let x = 0; x < gameCategories.length; x++) {
                    gameCategoriesAmount.push(0);
                }
                for (let x = 0; x < gamesWithoutApps.length; x++) {
                    gameDetails = await steam.getGameDetails(gameIDList[x], [false]);
                    for (let y = 0; y < gameCategories.length; y++) {
                        if (gameCategories[y] == gameDetails.categories[0].description) {
                            gameCategoriesAmount[y] = gameCategoriesAmount[y] + 1;
                        }
                    }
                }
                for (let x = 0; x < gameCategoriesAmount.length; x++) {
                    gameCategoriesAmount[x] = Math.round((gameCategoriesAmount[x] / calcTotal) * 100);
                }

                for (let x = 0; x < gameFree.length; x++) {
                    gameFreeAmount.push(0);
                }
                for (let x = 0; x < gamesWithoutApps.length; x++) {
                    gameDetails = await steam.getGameDetails(gameIDList[x], [false]);
                    for (let y = 0; y < gameFree.length; y++) {
                        if (gameFree[y] == gameDetails.is_free) {
                            gameFreeAmount[y] = gameFreeAmount[y] + 1;
                        }
                    }
                }
                for (let x = 0; x < gameFreeAmount.length; x++) {
                    gameFreeAmount[x] = Math.round((gameFreeAmount[x] / calcTotal) * 100);
                }

                for (let x = 0; x < featuredGames.featured_win.length; x++) {
                    gameDetails = await steam.getGameDetails(featuredGames.featured_win[x].id, [false]);
                    RecommendedGames.push(gameDetails)
                    let g = -1
                    let c = -1;
                    let f = -1;
                    for (let y = 0; y < gameGenres.length; y++) {
                        if (gameGenres[y] == gameDetails.genres[0].description) {
                            g = y;
                        }
                    }
                    for (let y = 0; y < gameCategories.length; y++) {
                        if (gameCategories[y] == gameDetails.categories[0].description) {
                            c = y;
                        }
                    }
                    for (let y = 0; y < gameFree.length; y++) {
                        if (gameFree[y] == gameDetails.is_free) {
                            f = y;
                        }
                    }
                    if (g >= 0 || c >= 0 || f >= 0) {
                        if (g < 0) {
                            gameGenresAmount.push(0);
                            g = gameGenresAmount.length-1;
                        }
                        if (c < 0) {
                            gameCategoriesAmount.push(0);
                            c = gameCategoriesAmount.length-1;
                        }
                        if (f < 0) {
                            gameFreeAmount.push(0);
                            f = gameFreeAmount.length-1;
                        }
                        if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) == 300) {
                            RecommendationScore.push(100);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 270 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 300) {
                            RecommendationScore.push(95);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 240 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 270) {
                            RecommendationScore.push(90);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 210 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 240) {
                            RecommendationScore.push(80);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 180 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 210) {
                            RecommendationScore.push(70);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 150 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 180) {
                            RecommendationScore.push(60);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 120 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 150) {
                            RecommendationScore.push(50);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 90 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 120) {
                            RecommendationScore.push(40);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 60 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 90) {
                            RecommendationScore.push(30);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 45 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 60) {
                            RecommendationScore.push(20);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) >= 30 && (gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 45) {
                            RecommendationScore.push(10);
                        } else if ((gameGenresAmount[g] + gameCategoriesAmount[c] + gameFreeAmount[f]) < 30) {
                            RecommendationScore.push(0);
                        }
                    } else {
                        RecommendationScore.push(0);
                    }
                }

                for (let x = 0; x < featuredGames.featured_win.length; x++) {
                    featuredGames.featured_win[x].original_price = featuredGames.featured_win[x].original_price / 100;
                    RecommendedGames[x].required_age = RecommendationScore[x];
                    featuredGames.featured_win[x].type = RecommendationScore[x];
                }

                RecommendedGames.sort(function(b, a){return (a.required_age) - (b.required_age)});
                featuredGames.featured_win.sort(function(b, a){return (a.type) - (b.type)});
                RecommendationScore.sort(function(b, a){return (a) - (b)});

                if (gamesWithoutApps.length <= 10) {
                    for (let i = gamesWithoutApps.length; i < 10; i++) {
                        gameLengthVars[`gameLength${i}`] = true;
                    }
                }
                if (gamesWithoutApps.length === 10) {
                    gameLengthFull = true;
                }

            } catch (error) {
                gamesPrivate = true
            }

            let userData = {
                gameLengthVars,
                id,
                player,
                summary,
                friends,
                games,
                friendsPrivate,
                gamesPrivate,
                isBanned,
                creationDate,
                personaState,
                level: level, level0, level10, level20, levelT, levelG,
                admin,
                online,
                lastOnline,
                daysSinceBan,
                games,
                gameIDList,
                gamesWithoutApps,
                gameLengthFull,
                NoGamesOwned,
                featuredGames,
                RecommendationScore,
                RecommendedGames
            };
            cache.set(id, userData);

            let file = await fs.readFile(__dirname + "/templates/webpage-input.html", "UTF-8");
            const template = Handlebars.compile(file);
            ctx.body = (template({
                id: id,
                player: player,
                summary: summary,
                friends: friends,
                games: games,
                friendsPrivate: friendsPrivate,
                gamesPrivate: gamesPrivate,
                isBanned: isBanned,
                creationDate: creationDate,
                personaState: personaState,
                level: level, level0, level10, level20, levelT, levelG,
                admin: admin,
                online: online,
                lastOnline: lastOnline,
                daysSinceBan: daysSinceBan,
                games: games,
                gameIDList: gameIDList,
                gamesWithoutApps: gamesWithoutApps,
                ...gameLengthVars,
                gameLengthFull: gameLengthFull,
                NoGamesOwned: NoGamesOwned,
                featuredGames: featuredGames,
                RecommendationScore: RecommendationScore,
                RecommendedGames: RecommendedGames
            }));

        } else {
            let file = await fs.readFile(__dirname + "/templates/private-profile.html", "UTF-8");
            const template = Handlebars.compile(file);
            ctx.body = (template(userData, { bans: bans, NoGamesOwned: NoGamesOwned, privateProfile: privateProfile, admin: admin }));
        }
    } else {
        let file = await fs.readFile(__dirname + "/templates/profile-set.html", "UTF-8");
        const template = Handlebars.compile(file);
        ctx.body = (template({ }));
    }
});

// Code on lines 344, 345 used when running server locally
console.log('Server is running on port 3000')
app.listen(3000);

// Code below used when running server in cloud
//console.log('Server is running...')
//app.listen();
