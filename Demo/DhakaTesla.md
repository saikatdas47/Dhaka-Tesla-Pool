title Dhaka Tesla Pool — Data Model
typeface clean
styleMode plain
colorMode pastel
notation crows-foot

Passenger [color: blue] {
  _id ObjectId pk
  name string
  username string unique_within_role
  email string unique_within_role
  phone string
  passwordHash string private
  refreshTokenHash string private
  avatarUrl string optional
}

RideRequest [color: orange] {
  _id ObjectId pk
  passenger ObjectId ref_Passenger
  pool ObjectId optional_ref_Pool
  pickupArea string
  destinationArea string
  seats int 1_to_4
  routeStops array
  pickupIndex int
  destinationIndex int
  status enum
  soloFarePaisa int
  currentEstimatePaisa int
  finalFarePaisa int nullable
  fareRule object snapshot
  fareBreakdown array embedded
  estimateHistoryPaisa array
  paymentMethod enum
  paymentStatus enum
  history array embedded
}

Pool [color: green] {
  _id ObjectId pk
  driver ObjectId ref_Driver
  routeStops array
  segmentKm array
  segmentSeats array reserved_per_edge
  currentStopIndex int
  capacity int 2_to_4
  occupiedSeats int
  members array embedded_booking_refs
  fareRule object snapshot
  vehicleName string snapshot
  vehicleRegistrationNumber string snapshot
  status enum
  history array embedded
}

Driver [color: blue] {
  _id ObjectId pk
  name string
  username string unique_within_role
  email string unique_within_role
  phone string
  passwordHash string private
  refreshTokenHash string private
  licenseNumber string unique
  licenseExpiry date
  vehicleModel string
  vehicleRegistrationNumber string unique
  passengerSeats int 2_to_4
  currentArea string
  availability enum
  verificationStatus enum
  verificationHistory array embedded
}

DriverReview [color: purple] {
  _id ObjectId pk
  ride ObjectId unique_ref_RideRequest
  passenger ObjectId ref_Passenger
  driver ObjectId ref_Driver
  passengerName string snapshot
  rating int 1_to_5
  comment string
  createdAt date
}

RideChat [color: yellow] {
  _id ObjectId pk
  ride ObjectId unique_ref_RideRequest
  pool ObjectId ref_Pool
  passenger ObjectId ref_Passenger
  driver ObjectId ref_Driver
  messages array embedded
  expiresAt date ttl_fallback
}

LiveFare [color: yellow] {
  _id ObjectId pk
  pool ObjectId unique_ref_Pool
  driver ObjectId ref_Driver
  settledThrough int
  segments array embedded_occupancy
}

FareSettings [color: purple] {
  _id string pk_current
  baseFarePaisa int
  perKmPaisa int
  discountBpsPerKm2 int
  discountBpsPerKm3 int
  discountBpsPerKm4 int
  maxDiscountBps int
}

EmailOtp [color: grey] {
  _id ObjectId pk
  role enum compound_unique_with_email
  email string
  otpHash string private
  registrationTokenHash string private
  attempts int
  expiresAt date ttl
}

RideRequest.passenger > Passenger._id
RideRequest.pool > Pool._id
Pool.driver > Driver._id
DriverReview.ride - RideRequest._id
DriverReview.passenger > Passenger._id
DriverReview.driver > Driver._id
RideChat.ride - RideRequest._id
RideChat.pool > Pool._id
RideChat.passenger > Passenger._id
RideChat.driver > Driver._id
LiveFare.pool - Pool._id
LiveFare.driver > Driver._id

legend {
  [color: blue, label: "Accounts and vehicle"]
  [color: orange, label: "Individual booking and payment"]
  [color: green, label: "Shared trip and capacity"]
  [color: purple, label: "Reviews and fare configuration"]
  [color: yellow, label: "Temporary trip data"]
  [color: grey, label: "Pre-registration OTP; no account FK"]
}
// Main business fields shown; operational fields omitted for readability.
// FareSettings values are copied into fareRule, not linked by an ObjectId.
// OTP uses role/email before an account exists; a fake FK must not be drawn.
// Unique connectors allow absent chat/review/ledger records.
// members/history/messages/breakdown are embedded, not extra collections.
