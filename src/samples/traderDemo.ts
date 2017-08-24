/***************************************************************************************************************************
 * @license                                                                                                                *
 * Copyright 2017 Coinbase, Inc.                                                                                           *
 *                                                                                                                         *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance          *
 * with the License. You may obtain a copy of the License at                                                               *
 *                                                                                                                         *
 * http://www.apache.org/licenses/LICENSE-2.0                                                                              *
 *                                                                                                                         *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on     *
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the                      *
 * License for the specific language governing permissions and limitations under the License.                              *
 ***************************************************************************************************************************/

import { getSubscribedFeeds } from '../factories/gdaxFactories';
import { ConsoleLoggerFactory } from '../utils/Logger';
import { GDAXFeed } from '../exchanges/gdax/GDAXFeed';
import { Trader, TraderConfig } from '../core/Trader';
import Limiter from '../core/RateLimiter';
import {
    PlaceOrderMessage,
    StreamMessage,
    TradeExecutedMessage,
    TradeFinalizedMessage,
} from '../core/Messages';
import { StaticCommandSet } from '../lib/StaticCommandSet';
import { LiveOrder } from '../lib/Orderbook';

const auth = {
    key: process.env.GDAX_KEY,
    secret: process.env.GDAX_SECRET,
    passphrase: process.env.GDAX_PASSPHRASE
};
const logger = ConsoleLoggerFactory();

/**
 * Prepare a set of order execution messages. For simplicity, we'll use `StaticCommandSet` to play them to
 * the `Trader`
 */
const messages: StreamMessage[] = [
    {
        type: 'placeOrder',
        productId: 'BTC-USD',
        size: '0.1',
        price: '1.0',
        side: 'buy',
        orderType: 'limit',
        postOnly: true
    } as PlaceOrderMessage,
    {
        type: 'placeOrder',
        productId: 'BTC-USD',
        size: '0.1',
        price: '1.1',
        side: 'buy',
        orderType: 'limit',
        postOnly: true
    } as PlaceOrderMessage,
    {
        type: 'placeOrder',
        productId: 'BTC-USD',
        size: '0.1',
        price: '1.2',
        side: 'buy',
        orderType: 'limit',
        postOnly: true
    } as PlaceOrderMessage,
    {
        type: 'placeOrder',
        productId: 'BTC-USD',
        size: '0.1',
        price: '1.3',
        side: 'buy',
        orderType: 'limit',
        postOnly: true
    } as PlaceOrderMessage,
    {
        type: 'placeOrder',
        productId: 'BTC-USD',
        size: '0.1',
        price: '1.4',
        side: 'buy',
        orderType: 'limit',
        postOnly: true
    } as PlaceOrderMessage
];

// We could also use FeedFactory here and avoid all the config above.
getSubscribedFeeds({ auth: auth, logger: logger }, ['BTC-USD']).then((feed: GDAXFeed) => {
    // Configure the trader, and use the API provided by the feed
    const traderConfig: TraderConfig = {
        logger: logger,
        productId: 'BTC-USD',
        exchangeAPI: feed.authenticatedAPI,
        fitOrders: false
    };
    const trader = new Trader(traderConfig);
    const orders = new StaticCommandSet(messages);
    // We use a limiter to play each order once every 2 seconds.
    const limiter = new Limiter(1, 500);
    // We'll play the orders through the limiter, so connect them up
    orders.pipe(limiter);
    // We can only pipe one stream into the trader, so we can't pipe both the GDAX feed as well as our trading commands.
    // We can pipe one, and then use the event mechanism to handle the other. In this demo we'll pipe the message feed
    // to trader,
    feed.pipe(trader);
    // .. and execute the trade messages as they come out of the limiter.
    limiter.on('data', (msg: StreamMessage) => {
        trader.executeMessage(msg);
    });

    // We're basically done. Now set up listeners to log the trades as they happen
    trader.on('Trader.order-placed', (msg: LiveOrder) => {
        logger.log('info', 'Order placed', JSON.stringify(msg));
    });
    trader.on('Trader.trade-executed', (msg: TradeExecutedMessage) => {
        logger.log('info', 'Trade executed', JSON.stringify(msg));
    });
    trader.on('Trader.trade-finalized', (msg: TradeFinalizedMessage) => {
        logger.log('info', 'Order complete', JSON.stringify(msg));
    });
    trader.on('Trader.my-orders-cancelled', (ids: string[]) => {
        logger.log('info', `${ids.length} orders cancelled`);
    });
    trader.on('error', (err: Error) => {
        logger.log('error', 'Error cancelling orders', err);
    });
    limiter.on('end', () => {
        console.log(JSON.stringify(trader.state()));
        // Wait a second to allow final order to settle
        setTimeout(() => {
            trader.cancelMyOrders().catch((err: Error) => {
                logger.log('error', 'Error cancelling orders', err);
            });
        }, 5000);

    });

    // Send the orders once the feed has initialised
    feed.once('snapshot', () => {
        orders.send();
    });

});
