import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "@repo/database";
import express from "express"
import z, { success } from "zod"
import type { JsonObject } from "@prisma/client/runtime/client";
import { authenticate } from "./middleware";
import { isBefore, isAfter, isEqual, compareAsc , set} from 'date-fns';



const app = express()

app.use(express.json())



export const registerSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(6),
  role: z.enum(["USER", "SERVICE_PROVIDER"]),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string(),

});

export const ServicesSchema = z.object({ 
    name : z.string() , 
    type : z.enum(["MEDICAL" ,"HOUSE_HELP","BEAUTY","FITNESS", "EDUCATION","OTHER"]) , 
    durationMinutes : z.int().multipleOf(30).min(30).max(120) ,

})

export const AvailabilitySchema = z.object({
    dayOfWeek : z.int().min(0).max(6),
    startTime : z.string(), 
    endTime : z.string()
})

export const error400InvalidRequest : JsonObject = { 
    success : false , 
    data : null , 
    error : "INVALID_REQUEST"
}
export const error403Forbidden : JsonObject = { 
    success : false , 
    data : null , 
    error : "FORBIDDEN"
}
export const error500InternalServerError  : JsonObject = { 
    success : false , 
    data : null , 
    error : "INTERNAL_SERVER_ERROR"
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

app.post("/auth/register" , async(req , res) => { 
  try {
    const validatedData = registerSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    const user = await prisma.user.create({
      data: {
        name: validatedData.name,
        email: validatedData.email,
        password : passwordHash,
        role: validatedData.role,
      },
    });

    res.status(201).json({ message: `User created Successfully with id ${user.id}` });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ZodError") {
      res.status(400).json({ error: "Invalid input", details: error });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
})

app.post("/auth/login" , async(req , res) => { 

  try {
    const validatedData = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValidPassword = await bcrypt.compare(validatedData.password, user.password);

    if (!isValidPassword) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({ token });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ZodError") {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
})

app.post("/services" ,authenticate  , async (req , res) => { 
    const userId = req.userId 
    const role = req.role
    if(role != "SERVICE_PROVIDER"){ 
        return res.status(403).json(error403Forbidden)
    }
    const {data , success } = ServicesSchema.safeParse(req.body)

    if(!success || !data) { 
        return  res.status(400).json(error400InvalidRequest)
    }

    try { 
        const newService = await prisma.service.create({
            data :  { 
                ...data , 
                providerId : userId!
            }
        })
        return res.status(201).json({
            id : newService.id , 
            name : newService.name , 
            type : newService.type , 
            durationMinutes : newService.durationMinutes
        })
    }
    catch(e){ 
        return res.status(500).json(error500InternalServerError)
    }
})
app.post("//services/:serviceId/availability" ,authenticate  , async (req , res) => { 
    const {serviceId} = req.params
    if(typeof(serviceId)!="string"){ 
        return res.status(400).json(error400InvalidRequest)
    }

    const userId = req.userId 
    const role = req.role
    if(role != "SERVICE_PROVIDER"){ 
        return res.status(403).json(error403Forbidden)
    }
    const {data , success } = AvailabilitySchema.safeParse(req.body)

    if(!success || !data) { 
        return  res.status(400).json(error400InvalidRequest)
    }

    const exisitngService = await prisma.service.findUnique({
        where : { 
            id : serviceId
        }
    })
    if(!exisitngService){ 
        return res.status(404).json({
            message : "service not found "
        })
    }
    const existingAvailablity = await prisma.availablity.findMany({ 
        where : { 
            serviceId : serviceId
        }
    })
    const wholeStartingTime = data.startTime.split(":")
    const wholeEndingTIme = data.endTime.split(":")
    const DataStartTime = set(new Date(), { hours: Number(wholeStartingTime[0]), minutes: Number(wholeEndingTIme[1]) })
    const DataEndTime = set(new Date(), { hours: Number(wholeEndingTIme[0]), minutes: Number(wholeEndingTIme[1]) })

    for(let i = 0 ; i > existingAvailablity.length ; i++){ 
        if(!(isAfter(DataStartTime , existingAvailablity[i].endTime)) || !((isAfter(DataEndTime, existingAvailablity[i].startTime))&& (isAfter(data.endTime , existingAvailablity[i].endTime)))){ 
            return res.status(409).json({ 
                success : false , 
                data : null , 
                message : "overlapping availablity"
            })
        }
    //     already booking -> [1 , 3 ] , 
    //     new booking -> [2 , 5 ]

    //     false kab kab hai , if already booking ka end time bada hai then new booking ka start time 
    //     and if new data ka end time must be greater than starttime and end time 

    //     true kab kab hai -> jav new data ka startTime bada hona chaiye then end time && end time greaterthan start time and end time 
    }
  
    try { 
        const newService = await prisma.availablity.create({
            data :  { 
                ...data , 
                startTime : DataStartTime , 
                endTime : DataEndTime , 
                serviceId : serviceId
            }
        })
        return res.status(201).json({
            message : "created"
        })
    }
    catch(e){ 
        return res.status(500).json(error500InternalServerError)
    }
})

app.get("/services" ,authenticate  , async (req , res) => { 
    const userId = req.userId 

    const {types} = req.query

    const where : any = { 
    
    }
    if ( types ) { 
        where.types = types
    }
    try { 
        const services = await prisma.service.findMany({
            where, 
            include : { 
                provider : true
            }
        })
        const FilterdServices = services.map( (x , i)=> ({ 
            id : services[i].id , 
            name : services[i].name , 
            type : services[i].type , 
            durationMinutes : services[i].durationMinutes , 
            providerName : services[i].provider.name
        }))
        return res.status(201).json(FilterdServices)
    }
    catch(e){ 
        return res.status(500).json(error500InternalServerError)
    }
})
app.get("/services/:serviceId/slots" ,authenticate  , async (req , res) => { 
    const userId = req.userId 
    //@ts-ignore
    const date : Date = req.query.date
    const {serviceId} = req.params
    if(typeof(serviceId)!= "string"){ 
        return res.status(400).json(error400InvalidRequest)
    }
    const exisitngService = await prisma.service.findUnique({
        where : { 
            id : serviceId
        }
    })
    if(!exisitngService){ 
        return res.status(404).json({
            message : "service not found "
        })
    }
    try { 
        const services = await prisma.availablity.findMany({
            where : { 
                startTime : { 
                    gte : date
                } , 
                endTime : { 
                    gte : date
                }
            }, 
        })
        const FilterdServices = services.map( (x , i)=> ({ 
            slotid : services[i].id , 
            startTime : services[i].startTime , 
            endTime : services[i].endTime , 
        }))
        return res.status(201).json({ 
            serviceId : serviceId , 
            date : date , 
            slots : FilterdServices
        })
    }
    catch(e){ 
        return res.status(500).json(error500InternalServerError)
    }
})




app.listen(3000 , ()=> { 
    console.log("server is running on port 3000")
})