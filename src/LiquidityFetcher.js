const { default: BigNumber } = require('bignumber.js');
const { ethers, Contract } = require('ethers');
const fs = require('fs');
const { uniswapV3PairAbi, pairsConfig } = require('./config');
const CONSTANT_1e18 = new BigNumber(10).pow(18);

////////////// CONFIGURATION ////////////////////
const rpcUrl = 'https://eth-mainnet.rpcfast.com?api_key=xbhWBI1Wkguk8SNMu1bvvLurPGLXmgwYeC4S6g2H7WdwFigZSmPWVZRxrskEQwIf'; // --> use infura for a faster fetch
// const rpcUrl = 'https://polygon.llamarpc.com'; // --> use infura for a faster fetch
const chosenConfig = pairsConfig.wstETHETH;
////////////// CONFIGURATION ////////////////////

async function FetchLiquidity() {

    const poolAddress = chosenConfig.poolAddress;
    const deployedBlock =  chosenConfig.deployedBlock;
    const token0 = chosenConfig.token0;
    const token1 = chosenConfig.token1;
    const fees = chosenConfig.fees;
    
    const web3Provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl);
    const currentBlock = await web3Provider.getBlockNumber();
    const univ3PairContract = new Contract(poolAddress, uniswapV3PairAbi, web3Provider);

    const lastDataFilename = `${token0}-${token1}-${fees}-data.json`;
    let latestData = undefined;
    if(fs.existsSync(lastDataFilename)) {
        latestData = JSON.parse(fs.readFileSync(lastDataFilename, 'utf-8'));
    } else {
        latestData = await fetchInitializeData(univ3PairContract, deployedBlock);
    }
    
    latestData.poolAddress = poolAddress;

    const filterBurn = univ3PairContract.filters.Burn();
    const filterMint = univ3PairContract.filters.Mint();
    const filterSwap = univ3PairContract.filters.Swap();
    let iface = new ethers.utils.Interface(uniswapV3PairAbi);

    const initBlockStep = 50000;
    const maxBlockStep = 500000;
    let blockStep = initBlockStep;
    let fromBlock =  latestData.blockNumber + 1;
    let toBlock = 0;
    let cptError = 0;
    while(toBlock < currentBlock) {
        toBlock = fromBlock + blockStep - 1;
        if(toBlock > currentBlock) {
            toBlock = currentBlock;
        }

        let events = undefined;
        try {
            events = await univ3PairContract.queryFilter({
                topics: [[
                    filterBurn.topics[0],
                    filterMint.topics[0],
                    filterSwap.topics[0],
                ],
                ]
            }, fromBlock, toBlock);
        }
        catch(e) {
            // console.log(`query filter error: ${e.toString()}`);
            blockStep = Math.round(blockStep / 2);
            if(blockStep < 1000) {
                blockStep = 1000;
            }
            toBlock = 0;
            cptError++;
            continue;
        }

        console.log(`[${token0}-${token1}-${fees}]: [${fromBlock} - ${toBlock}] found ${events.length} Mint/Burn/Swap events after ${cptError} errors (fetched ${toBlock-fromBlock+1} blocks)`);
        
        if(events.length != 0) {
            for (const event of events) {
                const parsedEvent = iface.parseLog(event);
                switch(parsedEvent.name.toLowerCase()) {
                    case 'mint':
                        if (parsedEvent.args.amount.gt(0)) {
                            const lqtyToAdd = new BigNumber(parsedEvent.args.amount.toString());
                            updateLatestDataLiquidity(latestData, parsedEvent.args.tickLower, parsedEvent.args.tickUpper, lqtyToAdd);
                        }
                        break;
                    case 'burn':
                        if (parsedEvent.args.amount.gt(0)) {
                            const lqtyToSub = new BigNumber(-1).times(new BigNumber(parsedEvent.args.amount.toString()));
                            updateLatestDataLiquidity(latestData, parsedEvent.args.tickLower, parsedEvent.args.tickUpper, lqtyToSub);
                        }
                        break;
                    case 'swap':
                        {
                            latestData.currentSqrtPriceX96 = parsedEvent.args.sqrtPriceX96.toString();
                            latestData.currentTick = parsedEvent.args.tick;
                            latestData.lastLiquidity = parsedEvent.args.liquidity.toString();
                            latestData.lastSwapBlock = event.blockNumber;
                        }
                        break;
                }
            }

            // try to find the blockstep to reach 8000 events per call as the RPC limit is 10 000, 
            // this try to change the blockstep by increasing it when the pool is not very used
            // or decreasing it when the pool is very used
            const newBlockStep = Math.min(1_000_000, Math.round(blockStep * 8000 / events.length));
            if(newBlockStep > blockStep * 2) {
                blockStep = blockStep * 2;
            } else {
                blockStep = newBlockStep;
            }

            if(blockStep > maxBlockStep) {
                blockStep = maxBlockStep;
            }

            cptError = 0;
        } else {
            // if 0 events, multiply blockstep by 4
            blockStep = blockStep * 2;
        }
        fromBlock = toBlock +1;
        latestData.blockNumber = toBlock;
    }
    
    console.log(`current tick: ${latestData.currentTick}`);
    fs.writeFileSync(lastDataFilename, JSON.stringify(latestData)); 
}

async function fetchInitializeData(univ3PairContract, deployedBlock) {
    let fromBlock = deployedBlock;
    let toBlock = deployedBlock + 100000;
    let latestData = undefined;
    while (!latestData) {
        console.log(`searching Initialize event between blocks [${fromBlock} - ${toBlock}]`);
        const initEvents = await univ3PairContract.queryFilter('Initialize', fromBlock, toBlock);
        if (initEvents.length > 0) {
            if (initEvents > 1) {
                throw new Error('More than 1 Initialize event found???');
            }

            console.log(`found Initialize event at block ${initEvents[0].blockNumber}`);

            latestData = {
                currentTick: initEvents[0].args.tick,
                currentSqrtPriceX96: initEvents[0].args.sqrtPriceX96.toString(),
                tickSpacing: await univ3PairContract.tickSpacing(),
                blockNumber: initEvents[0].blockNumber - 1,
                lastLiquidity: 0,
                lastSwapBlock: 0,
                ticks: {},
            };
        } else {
            console.log(`Initialize event not found between blocks [${fromBlock} - ${toBlock}]`);
            fromBlock = toBlock + 1;
            toBlock = fromBlock + 100000;
        }
    }
    return latestData;
}


function updateLatestDataLiquidity(latestData, tickLower, tickUpper, amount) {
    const amountNorm = amount.div(CONSTANT_1e18).toNumber();
    for(let tick = tickLower ; tick < tickUpper ; tick += latestData.tickSpacing) {
        if(!latestData.ticks[tick]) {
            latestData.ticks[tick] = 0;
        }

        // always add because for burn events, amount value will be < 0
        latestData.ticks[tick] += amountNorm;
    }
}

FetchLiquidity();