const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(
  "sk_test_51L1DFFCwGCfttUfetaClgTfbb1SVvNORxfaMelkCv5hhM3um1PFvZ9phej8uuPYU5rYxuhRL202Pype4bSGMpBRa002Brx7Zaz"
);

const app = express();

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://abc-tools:isSTypyRDJFl75UK@cluster0.oegym.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
const ACCESS_TOKEN =
  "0d870417fccc085ae1b594ef307d52938038639c9d1367b7ab79c1511419b55adc79650e9b8227f36029209d9d43b72899c3a17fc292073ab8e9ea769df15959";
function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "UnAuthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    await client.connect();
    const toolsCollection = client.db("abc-tools").collection("tools");
    const bookingCollection = client.db("abc-tools").collection("booking");
    const allBooking = client.db("abc-tools").collection("allbooking");
    const userCollection = client.db("abc-tools").collection("users");
    const allUserCollection = client.db("abc-tools").collection("allusers");
    const paymentsCollection = client.db("abc-tools").collection("payments");
    const reviewsCollection = client.db("abc-tools").collection("reviews");

    app.get("/tools", async (req, res) => {
      const tools = await toolsCollection.find().toArray();
      res.send(tools);
    });
    app.get("/tools/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const tools = await toolsCollection.findOne(query);
      res.send(tools);
    });
    app.post("/tools", async (req, res) => {
      const tools = req.body;
      const result = await toolsCollection.insertOne(tools);
      res.send(result);
    });

    app.post("/booking", async (req, res) => {
      const booking = req.body;
      const result = await bookingCollection.insertOne(booking);
      const allResult = await allBooking.insertOne(booking);
      res.send({ result, allResult });
    });

    app.get("/booking", verifyJWT, async (req, res) => {
      const userEmail = req.query.userEmail;
      const decodedEmail = req.decoded.email;
      if (userEmail === decodedEmail) {
        const query = { userEmail: userEmail };
        const booking = await bookingCollection.find(query).toArray();
        res.send(booking);
      } else {
        return res.status(403).send({ message: "Forbidden access" });
      }
    });

    app.get("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const booking = await bookingCollection.findOne(query);
      res.send(booking);
    });

    app.patch("/booking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionID: payment.transactionId,
          status: "pending",
        },
      };
      const updatedBooking = await bookingCollection.updateOne(
        filter,
        updatedDoc
      );
      const allCollection = await allBooking.updateOne(filter, updatedDoc);
      const result = await paymentsCollection.insertOne(payment);
      res.send(updatedDoc);
    });

    app.patch("/allbooking/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "shipped",
        },
      };
      const allCollection = await allBooking.updateOne(filter, updatedDoc);
      res.send(updatedDoc);
    });

    // all booking
    app.get("/allbooking", async (req, res) => {
      const allbooking = await allBooking.find().toArray();
      res.send(allbooking);
    });
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const service = req.body;
      const price = service.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // get user by using email
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, ACCESS_TOKEN);
      res.send({ result, token });
    });
    app.patch("/allusers/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await allUserCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      const token = jwt.sign({ email: email }, ACCESS_TOKEN);
      res.send({ result, token });
    });

    // make an admin
    app.put("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({
        email: requester,
      });
      if (requesterAccount.role == "admin") {
        const filter = { email: email };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({ message: "forbidden" });
      }
    });

    app.get("/admin/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const admin = user.role == "admin";
      res.send({ admin: admin });
    });
    app.get("/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });
    //
    // all user
    app.get("/allusers", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const booking = await allUserCollection.find(query).toArray();
      res.send(booking);
    });
    // update all user
    app.patch("/alluser/:email", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const info = req.body;
      console.log(info);
      const filter = { email: email };
      const allCollection = await allUserCollection.updateOne(info, filter);
      res.send(allCollection);
    });
    app.get("/reviews", async (req, res) => {
      const reviews = await reviewsCollection.find().toArray();
      res.send(reviews);
    });
    app.put("/reviews", async (req, res) => {
      const reviews = req.body;
      const result = await reviewsCollection.insertOne(reviews);
      res.send(result);
    });
    app.delete("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });
    app.delete("/tools/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await toolsCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("server is running");
});
app.listen(port, () => {
  console.log("ABC tools server is ", port);
});
