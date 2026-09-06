const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function calculateSunTimes(date = new Date(), latitude = 41.9028, longitude = 12.4964) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();

    const startOfYear = Date.UTC(year, 0, 1);
    const currentDay = Date.UTC(year, month, day);
    const dayOfYear = Math.floor((currentDay - startOfYear) / (24 * 3600 * 1000)) + 1;

    const b = (360 / 365) * (dayOfYear - 81) * RAD;
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

    const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * RAD) * RAD;

    const latRad = latitude * RAD;
    const cosHourAngle = (Math.cos(90.833 * RAD) - Math.sin(latRad) * Math.sin(declination)) /
                         (Math.cos(latRad) * Math.cos(declination));

    if (cosHourAngle > 1) {
        return { polarNight: true, polarDay: false, sunrise: null, sunset: null };
    }
    if (cosHourAngle < -1) {
        return { polarNight: false, polarDay: true, sunrise: null, sunset: null };
    }

    const hourAngle = Math.acos(cosHourAngle) * DEG;
    const solarNoonUtcMinutes = 720 - 4 * longitude - eot;

    const sunriseUtcMinutes = solarNoonUtcMinutes - hourAngle * 4;
    const sunsetUtcMinutes = solarNoonUtcMinutes + hourAngle * 4;

    const midnightUtc = Date.UTC(year, month, day, 0, 0, 0);
    const sunrise = new Date(midnightUtc + sunriseUtcMinutes * 60 * 1000);
    const sunset = new Date(midnightUtc + sunsetUtcMinutes * 60 * 1000);

    return {
        polarNight: false,
        polarDay: false,
        sunrise,
        sunset
    };
}

export function isSunUp(date = new Date(), latitude = 41.9028, longitude = 12.4964) {
    const { polarNight, polarDay, sunrise, sunset } = calculateSunTimes(date, latitude, longitude);
    if (polarNight) return false;
    if (polarDay) return true;

    const time = date.getTime();
    return time >= sunrise.getTime() && time <= sunset.getTime();
}
