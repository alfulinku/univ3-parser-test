const fs = require('fs');
const BigNumber = require('bignumber.js');
const { pairsConfig, uniswapV3PairAbi, erc20ABI } = require('./config');
const { ethers, Contract } = require('ethers');
const CONSTANT_1e18 = new BigNumber(10).pow(18);
const rpcUrl = 'https://eth-mainnet.rpcfast.com?api_key=xbhWBI1Wkguk8SNMu1bvvLurPGLXmgwYeC4S6g2H7WdwFigZSmPWVZRxrskEQwIf'; // --> use infura for a faster fetch

const web3Provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);

TickComputer();

async function TickComputer() {
    const chosenConfig = pairsConfig.cbETHETH;
    const fileName = `${chosenConfig.token0}-${chosenConfig.token1}-${chosenConfig.fees}-data.json`;
    const latestData = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
    console.log('------------------------------------');

    // find the tokens on the pool
    const univ3PairContract = new Contract(chosenConfig.poolAddress, uniswapV3PairAbi, web3Provider);
    const token0 = await univ3PairContract.token0();
    const token1 = await univ3PairContract.token1();

    const token0Contract = new Contract(token0, erc20ABI, web3Provider);
    const token0Decimals = await token0Contract.decimals();
    const token1Contract = new Contract(token1, erc20ABI, web3Provider);
    const token1Decimals = await token1Contract.decimals();

    const poolHoldingToken0 = await token0Contract.balanceOf(chosenConfig.poolAddress);
    const poolHoldingToken1 = await token1Contract.balanceOf(chosenConfig.poolAddress);

    const poolHoldingToken0Normalized = new BigNumber(poolHoldingToken0.toString()).div(new BigNumber(10).pow(token0Decimals)).toNumber();
    const poolHoldingToken1Normalized = new BigNumber(poolHoldingToken1.toString()).div(new BigNumber(10).pow(token1Decimals)).toNumber();

    console.log(`Starting tick computer, starting tick: ${latestData.currentTick}`);
    console.log(`${latestData.ticks[latestData.currentTick]} --> Liquidity at tick ${latestData.currentTick}`);
    console.log(`${new BigNumber(latestData.lastLiquidity).div(CONSTANT_1e18).toNumber()} --> Liquidity from last swap`);

    const amountOfWethToSell = new BigNumber(100_000).times(CONSTANT_1e18);
    const amountOfwstEth = get_dx(latestData.currentTick, 
        latestData.tickSpacing,
        latestData.currentSqrtPriceX96,
        latestData.ticks,
        amountOfWethToSell);
    console.log(`${chosenConfig.token0} from get_dx:`, amountOfwstEth.div(CONSTANT_1e18).toNumber());

    // this is the amount of tick we want to get the liquidity from, starting from current tick.
    // Example starting from current == 470, will sum liquidity for 470, then 460, then 450 etc..
    const tickCount = Number(process.argv[2] || 5);
    const newResultX = getXAmountForTickCount(tickCount, latestData.currentTick , latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    const newResultY = getYAmountForTickCount(tickCount, latestData.currentTick, latestData.tickSpacing, latestData.ticks, 18, latestData.currentSqrtPriceX96);
    console.log(`TotalX (${chosenConfig.token0}) available in ${tickCount} ticks: ${newResultX}. BalanceOf pool: ${poolHoldingToken0Normalized}`);
    console.log(`TotalY (${chosenConfig.token1}) available in ${tickCount} ticks: ${newResultY}. BalanceOf pool: ${poolHoldingToken1Normalized}`);

    // compare liquidity with what's on the pool
}


function getTickForPrice(price) {
    // price = 1.0001 ^ tick
    // tick = ln(price) / ln(1.0001)
    return Math.log(price) / Math.log(1.0001);
}

/**
 * Returns the amount available for X (token0) in 'tickCount' ticks (including current tick)
 * When possible, the notation are the same as https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf
 */
function getXAmountForTickCount(tickCount, currentTick, tickSpacing, liquidities, tokenDecimals, sqrtPriceX96) {
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits); 
    const P = sqrtP.times(sqrtP).toNumber();
    const decimalFactor = new BigNumber(10).pow(tokenDecimals);

    let workingTick = currentTick;
    let totalX = 0;

    
    const tickForPrice = getTickForPrice(P);
    console.log(`P: ${P}, tick: ${currentTick}, realTickForPrice: ${tickForPrice}`);
    // if(workingTick % tickSpacing == 0) {
    //     first = false;
    //     workingTick = workingTick + tickSpacing;
    // }

    while(workingTick < currentTick + tickCount * tickSpacing) {
        const L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);
        // console.log(`TICK ${workingTick}, L: ${liquidities[workingTick]}`);

        if(!L.isNaN()) {
            // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let xLiquidityInTick = 0;

            // console.log('P', P);
            // console.log('pa', pa);
            // console.log('pb', pb);
            let tickType = '';
            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
                tickType = 'ONLY X';
                const x = L.times(sqrtPb - sqrtPa).div(sqrtPa * sqrtPb);
                xLiquidityInTick = x.div(decimalFactor).toNumber();
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
            // We want X so don't care for this case
                tickType = 'ONLY Y';
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                tickType = 'MIX';
                const x = L.times(sqrtPb - sqrtP).div(sqrtP * sqrtPb);
                xLiquidityInTick = x.div(decimalFactor).toNumber();
            }

            totalX += xLiquidityInTick;
            if(tickCount <= 10) {
                console.log(`${workingTick} [${getTickPrice(workingTick)}] [${tickType}]: xLiquidity at tick: ${xLiquidityInTick}. New total: ${totalX}`);
            }
        }

        // if(workingTick == currentTick && workingTick % tickSpacing == 0) {
        //     workingTick += tickSpacing;
        // }
        workingTick += tickSpacing;
    }

    return totalX;
}


/**
 * Returns the amount available for Y (token1) in 'tickCount' ticks (including current tick)
 * When possible, the notation are the same as https://atiselsts.github.io/pdfs/uniswap-v3-liquidity-math.pdf
 */
function getYAmountForTickCount(tickCount,currentTick, tickSpacing, liquidities, tokenDecimals, sqrtPriceX96) {
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    const sqrtP = new BigNumber(sqrtPriceX96).div(_96bits); 
    const P = sqrtP.times(sqrtP).toNumber();
    const decimalFactor = new BigNumber(10).pow(tokenDecimals);

    let workingTick = currentTick;
    let totalY = 0;
    let first = true;
    while(workingTick > currentTick - tickCount * tickSpacing) {
        const L = new BigNumber(liquidities[workingTick]).times(CONSTANT_1e18);
        if(!L.isNaN()) {
        // pa = lower bound price range
            const lowerBoundTick = getNextLowerTick(workingTick, tickSpacing);
            const pa = getTickPrice(lowerBoundTick);
            const sqrtPa = Math.sqrt(pa);
            // pb = upper bound price range
            const upperBoundTick = lowerBoundTick + tickSpacing;
            const pb = getTickPrice(upperBoundTick);
            const sqrtPb = Math.sqrt(pb);
            let yLiquidityInTick = 0;

            let tickType = '';

            // Assuming P ≤ pa, the position is fully in X, so y = 0
            if(P <= pa) {
                tickType = 'ONLY X';
            // We want X so don't care for this case
            } 
            // Assuming P ≥ pb, the position is fully in Y , so x = 0:
            else if(P >= pb) {
                tickType = 'ONLY Y';
                const y = L.times(sqrtPb - sqrtPa);
                yLiquidityInTick = y.div(decimalFactor).toNumber();
            } 
            // If the current price is in the range: pa < P < pb. mix of x and y
            else {
                tickType = 'MIX';
                const y = L.times(sqrtP - sqrtPa);
                yLiquidityInTick = y.div(decimalFactor).toNumber();
            }

            totalY += yLiquidityInTick;
            
            if(tickCount <= 10) {
                console.log(`${workingTick} [${getTickPrice(workingTick)}] [${tickType}]: yLiquidity at tick: ${yLiquidityInTick}. New total: ${totalY}`);
            }
        }

        workingTick -= tickSpacing;
        
        // if(first) {
        //     first = false;
        //     workingTick -= tickSpacing;
        // }
    }

    return totalY;
}



function getTickPrice(tick) {
    return 1.0001 ** tick;
}

/**
 * Get the next lower tick as the current tick returned can sometimes not be in the valid range
 * @param {number} currentTick 
 * @param {number} tickSpacing 
 * @returns {number} Valid tick
 */
function getNextLowerTick(currentTick, tickSpacing) {
    return (Math.floor(currentTick / tickSpacing)) * tickSpacing;
}


function get_dx(tick, tickSpacing, sqrtPriceX96, liquidity, dy) {
    const base = new BigNumber(1.0001);

    let remainingQty = new BigNumber(dy);
    let dx = new BigNumber(0);
    BigNumber.config({ POW_PRECISION: 10 });
    const _96bits = new BigNumber(2).pow(new BigNumber(96));
    let currSqrtPrice = new BigNumber(sqrtPriceX96).div(_96bits); 
    let currTick = Number(tick);

    // when selling y, the price goes down
    while(remainingQty.gt(0)) {
        const nextTick = currTick - (currTick % Number(tickSpacing)) + Number(tickSpacing)
        //console.log({base},{nextTick})
        const nextSqrtPrice = (base.pow(nextTick)).sqrt();

        const L = new BigNumber(liquidity[currTick]).times(CONSTANT_1e18);
        // console.log({currTick});

        // dx = L/d(sqrt(p))
        const maxDy = L.times(nextSqrtPrice.minus(currSqrtPrice));
        // console.log(L.toString(), maxDy.toString(), currSqrtPrice.toString());

        //console.log(currSqrtPrice.toString(), nextSqrtPrice.toString())

        let nextP;
        if(remainingQty.lt(maxDy)) {
            // qty = L(nextP - P)
            // nextP = p + qty/L
            nextP = currSqrtPrice.plus(remainingQty.div(L));
            remainingQty = new BigNumber(0);
        }
        else {
            nextP = nextSqrtPrice;
            remainingQty = remainingQty.minus(maxDy);
            // console.log('maxDy', maxDy.toString());
        }

        // dx = L/pcurrent - L/pnext
        dx = dx.plus(L.div(currSqrtPrice).minus(L.div(nextP)));
        // console.log(nextP.toString(), currSqrtPrice.toString());


        // console.log('dx', dx.toString(), remainingQty.toString(), currTick);


        // move to next tick
        currSqrtPrice = nextSqrtPrice;
        currTick = nextTick;
    }

    return dx;
}